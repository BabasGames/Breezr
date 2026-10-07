import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ExternalPalette, SourceUpdate } from '../src/shared/palette';
import { readFileSourceOnce, watchFileSource, type SourceHandle } from '../src/main/theme-source';

// Test palette format: { "c": "#rrggbb" } → accent.
let parses = 0;
const parse = (raw: unknown): ExternalPalette | null => {
  parses++;
  const c = (raw as { c?: unknown } | null)?.c;
  return typeof c === 'string' ? { colors: { accent: c } } : null;
};
const accent = (u: SourceUpdate | undefined) => u?.palette?.colors.accent;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await sleep(10);
  }
}

let dir: string;
let handle: SourceHandle | null;
let updates: SourceUpdate[];
const FAST = { debounceMs: 60, retryMs: 30, pollMs: 100 };
const atomicWrite = (path: string, content: string) => {
  const tmp = join(dir, `tmp${Math.random().toString(36).slice(2)}`);
  writeFileSync(tmp, content);
  renameSync(tmp, path);
};
const start = (path: string, extra: Partial<Parameters<typeof watchFileSource>[0]> = {}) => {
  handle = watchFileSource({ path, parse, home: dir, onUpdate: (u) => updates.push(u), ...FAST, ...extra });
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'breezr-src-'));
  handle = null;
  updates = [];
  parses = 0;
});
afterEach(() => {
  handle?.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe('watchFileSource', () => {
  test('reads immediately on start', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    expect(accent(updates[0])).toBe('#111111');
    expect(updates[0].status.state).toBe('ok');
    expect(updates[0].status.displayPath).toBe('~/scheme.json');
    expect(typeof updates[0].status.updatedAt).toBe('number');
  });

  test('a burst of atomic replaces gives ONE update with the final palette (Review Focus 1)', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    atomicWrite(path, '{"c":"#222222"}');
    await sleep(10);
    atomicWrite(path, '{"c":"#333333"}');
    await sleep(10);
    atomicWrite(path, '{"c":"#444444"}');
    await waitFor(() => updates.length >= 2);
    await sleep(200);
    expect(updates.length).toBe(2);
    expect(accent(updates[1])).toBe('#444444');
  });

  test('an in-place rewrite with an empty moment does not flash an error', async () => {
    const path = join(dir, 'colors.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    writeFileSync(path, '');
    await sleep(20);
    writeFileSync(path, '{"c":"#555555"}');
    await waitFor(() => updates.length >= 2);
    await sleep(200);
    expect(updates.map((u) => u.status.state)).toEqual(['ok', 'ok']);
    expect(accent(updates[1])).toBe('#555555');
  });

  test('an identical rewrite gives no update', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    atomicWrite(path, '{ "c": "#111111" }');
    await sleep(250);
    expect(updates.length).toBe(1);
  });

  test('changes to other files of the folder are ignored without reading', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    const before = parses;
    writeFileSync(join(dir, 'notifs.json'), '[]');
    atomicWrite(join(dir, 'theme.lock'), '');
    await sleep(250);
    expect(parses).toBe(before);
  });

  test('symlink: target replaced, then link re-pointed (Review Focus 2)', async () => {
    const real = join(dir, 'real');
    const cache = join(dir, 'cache');
    mkdirSync(real);
    mkdirSync(cache);
    const a = join(real, 'a.json');
    const b = join(real, 'b.json');
    writeFileSync(a, '{"c":"#aaaaaa"}');
    writeFileSync(b, '{"c":"#bbbbbb"}');
    const link = join(cache, 'colors.json');
    symlinkSync(a, link);
    start(link);
    await waitFor(() => updates.length === 1);
    expect(accent(updates[0])).toBe('#aaaaaa');

    const tmpA = join(real, 'tmpA');
    writeFileSync(tmpA, '{"c":"#a1a1a1"}');
    renameSync(tmpA, a);
    await waitFor(() => accent(updates.at(-1)) === '#a1a1a1');

    const tmpLink = join(cache, 'tmplink');
    symlinkSync(b, tmpLink);
    renameSync(tmpLink, link);
    await waitFor(() => accent(updates.at(-1)) === '#bbbbbb');

    // The old target is no longer followed.
    writeFileSync(a, '{"c":"#a2a2a2"}');
    await sleep(250);
    expect(accent(updates.at(-1))).toBe('#bbbbbb');
  });

  test('missing folder: reports missing, then picks the file up when it appears', async () => {
    const path = join(dir, 'later', 'scheme.json');
    start(path);
    await waitFor(() => updates.length === 1);
    expect(updates[0]).toMatchObject({ palette: null, status: { state: 'missing' } });
    mkdirSync(join(dir, 'later'));
    writeFileSync(path, '{"c":"#666666"}');
    await waitFor(() => accent(updates.at(-1)) === '#666666', 4000);
    expect(updates.at(-1)!.status.state).toBe('ok');
  });

  test('a deleted file keeps the last palette and says so', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    unlinkSync(path);
    await waitFor(() => updates.length === 2);
    expect(updates[1]).toMatchObject({ palette: { colors: { accent: '#111111' } }, status: { state: 'missing', kept: true } });
  });

  test('a permanently broken file keeps the last palette (invalid)', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    writeFileSync(path, '{"c": ');
    await waitFor(() => updates.length === 2);
    expect(updates[1]).toMatchObject({ palette: { colors: { accent: '#111111' } }, status: { state: 'invalid', kept: true } });
  });

  test('initial palette seeds the fingerprint: same content only refreshes the status', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path, { initial: { colors: { accent: '#111111' } } });
    await waitFor(() => updates.length === 1);
    expect(updates[0].status.state).toBe('ok');
  });

  test('a FIFO is reported invalid without hanging', async () => {
    const path = join(dir, 'fifo');
    execFileSync('mkfifo', [path]);
    start(path);
    await waitFor(() => updates.length === 1);
    expect(updates[0].status.state).toBe('invalid');
  });

  test('stop() right after start: no update, no late watcher', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    handle!.stop();
    atomicWrite(path, '{"c":"#999999"}');
    await sleep(300);
    expect(updates).toEqual([]);
  });

  test('stop() cancels a pending debounced read', async () => {
    const path = join(dir, 'scheme.json');
    writeFileSync(path, '{"c":"#111111"}');
    start(path);
    await waitFor(() => updates.length === 1);
    atomicWrite(path, '{"c":"#999999"}');
    await sleep(15);
    handle!.stop();
    await sleep(250);
    expect(updates.length).toBe(1);
  });
});

describe('readFileSourceOnce', () => {
  test('ok', async () => {
    const path = join(dir, 'x.json');
    writeFileSync(path, '{"c":"#121212"}');
    const u = await readFileSourceOnce(path, parse, dir, () => 5);
    expect(u).toEqual({ palette: { colors: { accent: '#121212' } }, status: { state: 'ok', displayPath: '~/x.json', updatedAt: 5 } });
  });
  test('missing', async () => {
    expect((await readFileSourceOnce(join(dir, 'none.json'), parse, dir)).status.state).toBe('missing');
  });
  test('unparseable', async () => {
    const path = join(dir, 'x.json');
    writeFileSync(path, 'garbage');
    expect(await readFileSourceOnce(path, parse, dir)).toMatchObject({ palette: null, status: { state: 'invalid' } });
  });
});
