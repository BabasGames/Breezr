import { afterAll, beforeAll, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MAX_SOURCE_BYTES, readBoundedText } from '../src/main/read-bounded';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'breezr-read-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('limit is 256 KiB', () => expect(MAX_SOURCE_BYTES).toBe(262144));

test('reads a regular file', async () => {
  const path = join(dir, 'ok.json');
  writeFileSync(path, '{"a":1}');
  expect(await readBoundedText(path)).toEqual({ ok: true, text: '{"a":1}' });
});

test('missing file', async () => {
  expect(await readBoundedText(join(dir, 'nope.json'))).toEqual({ ok: false, reason: 'missing' });
});

test('missing parent folder', async () => {
  expect(await readBoundedText(join(dir, 'no-dir', 'x.json'))).toEqual({ ok: false, reason: 'missing' });
});

test('a directory is refused', async () => {
  expect(await readBoundedText(dir)).toEqual({ ok: false, reason: 'invalid' });
});

test('an oversized file is refused', async () => {
  const path = join(dir, 'big.json');
  writeFileSync(path, 'x'.repeat(2048));
  expect(await readBoundedText(path, 1024)).toEqual({ ok: false, reason: 'invalid' });
});

test('a FIFO is refused without hanging', async () => {
  const path = join(dir, 'fifo');
  execFileSync('mkfifo', [path]);
  const result = await Promise.race([
    readBoundedText(path),
    new Promise((r) => setTimeout(() => r('timeout'), 2000)),
  ]);
  expect(result).toEqual({ ok: false, reason: 'invalid' });
});

test('a character device is refused', async () => {
  expect(await readBoundedText('/dev/zero')).toEqual({ ok: false, reason: 'invalid' });
});
