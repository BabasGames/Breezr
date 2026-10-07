import { beforeEach, describe, expect, test } from 'bun:test';
import type { ExternalPalette, SourceUpdate } from '../src/shared/palette';
import { DEFAULT_THEME, type ThemeConfig } from '../src/shared/theme-model';
import { ThemeState, sourceKey, type ThemeStateDeps } from '../src/main/theme-state';

const env = { home: '/home/u' };
const pal = (accent: string): ExternalPalette => ({ colors: { accent } });
const ok = (accent: string): SourceUpdate => ({ palette: pal(accent), status: { state: 'ok', updatedAt: 1 } });
const theme = (patch: Partial<ThemeConfig>): ThemeConfig => ({ ...DEFAULT_THEME, enabled: true, ...patch });
const flush = () => new Promise((r) => setTimeout(r, 0));

type Applied = { source: string; accent: string | undefined; transition: boolean };
let applied: Applied[];
let notified: (SourceUpdate & { forSource: string })[];
let watchers: { source: string; initial: ExternalPalette | null; onUpdate: (u: SourceUpdate) => void; stopped: boolean }[];
let reads: Record<string, SourceUpdate>;
let readCalls: string[];
let cache: Record<string, ExternalPalette>;
let clock: number;
let deps: ThemeStateDeps;

beforeEach(() => {
  applied = [];
  notified = [];
  watchers = [];
  reads = { caelestia: ok('#caeca0'), pywal: ok('#bada55'), system: { palette: null, status: { state: 'unavailable' } } };
  readCalls = [];
  cache = {};
  clock = 100_000;
  deps = {
    env,
    readOnce: async (t) => { readCalls.push(t.source); return reads[t.source]; },
    watch: (t, initial, onUpdate) => {
      const w = { source: t.source, initial, onUpdate, stopped: false };
      watchers.push(w);
      return { stop: () => { w.stopped = true; } };
    },
    apply: async (t, palette, opts) => { applied.push({ source: t.source, accent: palette?.colors.accent, transition: opts.transition }); },
    notify: (u) => { notified.push(u); },
    loadCache: (key) => cache[key] ?? null,
    saveCache: (key, p) => { cache[key] = p; },
    now: () => clock,
  };
});

describe('sourceKey', () => {
  test('manual or disabled → manual', () => {
    expect(sourceKey(theme({ source: 'manual' }), env)).toBe('manual');
    expect(sourceKey(theme({ source: 'caelestia', enabled: false }), env)).toBe('manual');
  });
  test('default and custom paths', () => {
    expect(sourceKey(theme({ source: 'caelestia' }), env)).toBe('caelestia:/home/u/.local/state/caelestia/scheme.json');
    expect(sourceKey(theme({ source: 'pywal', sourcePaths: { caelestia: '', pywal: '/x/c.json' } }), env)).toBe('pywal:/x/c.json');
    expect(sourceKey(theme({ source: 'system' }), env)).toBe('system');
  });
});

describe('ThemeState', () => {
  test('start: cache, then a fresh read, then a watcher seeded with it', async () => {
    const saved = theme({ source: 'caelestia' });
    cache[sourceKey(saved, env)] = pal('#cac4e0');
    const s = new ThemeState(deps);
    await s.start(saved);
    expect(readCalls).toEqual(['caelestia']);
    expect(watchers).toHaveLength(1);
    expect(watchers[0].initial).toEqual(pal('#caeca0'));
    expect(s.displayed().palette).toEqual(pal('#caeca0'));
    expect(cache[sourceKey(saved, env)]).toEqual(pal('#caeca0'));
  });

  test('start: a failed read keeps the cached palette and says so', async () => {
    const saved = theme({ source: 'caelestia' });
    cache[sourceKey(saved, env)] = pal('#cac4e0');
    reads.caelestia = { palette: null, status: { state: 'missing' } };
    const s = new ThemeState(deps);
    await s.start(saved);
    expect(s.displayed().palette).toEqual(pal('#cac4e0'));
    expect(s.savedSource().status).toMatchObject({ state: 'missing', kept: true });
  });

  test('manual or disabled theme: no read, no watcher', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'manual' }));
    await s.save(theme({ source: 'caelestia', enabled: false }));
    expect(readCalls).toEqual([]);
    expect(watchers).toEqual([]);
  });

  test('documentReady applies without fade; updates within 2 s do not fade either', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    await s.documentReady();
    expect(applied.at(-1)).toEqual({ source: 'caelestia', accent: '#caeca0', transition: false });
    clock += 1000;
    watchers[0].onUpdate(ok('#111111'));
    await flush();
    expect(applied.at(-1)).toEqual({ source: 'caelestia', accent: '#111111', transition: false });
    clock += 1500;
    watchers[0].onUpdate(ok('#222222'));
    await flush();
    expect(applied.at(-1)).toEqual({ source: 'caelestia', accent: '#222222', transition: true });
    expect(notified.at(-1)).toMatchObject({ palette: pal('#222222') });
  });

  test('no fade while the modal is open', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    await s.documentReady();
    clock += 5000;
    s.setModalOpen(true);
    watchers[0].onUpdate(ok('#333333'));
    await flush();
    expect(applied.at(-1)?.transition).toBe(false);
  });

  test('a saved-source update does not overwrite a preview of another source (Review Focus 3)', async () => {
    const saved = theme({ source: 'caelestia' });
    const s = new ThemeState(deps);
    await s.start(saved);
    await s.documentReady();
    s.setModalOpen(true);
    await s.preview(theme({ source: 'pywal' }));
    expect(applied.at(-1)).toEqual({ source: 'pywal', accent: '#bada55', transition: false });
    expect(notified.at(-1)).toMatchObject({ palette: pal('#bada55') });
    const before = applied.length;
    const notifiedBefore = notified.length;
    watchers[0].onUpdate(ok('#444444'));
    await flush();
    expect(applied.length).toBe(before);
    expect(notified.length).toBe(notifiedBefore);
    await s.cancel();
    expect(applied.at(-1)).toEqual({ source: 'caelestia', accent: '#444444', transition: false });
  });

  test('previewing the saved source again sends its palette back to the modal', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    await s.preview(theme({ source: 'pywal' }));
    await s.preview(theme({ source: 'caelestia' }));
    expect(notified.at(-1)).toMatchObject({ palette: pal('#caeca0') });
    expect(readCalls).toEqual(['caelestia', 'pywal']);
  });

  test('previewing manual clears the palette in the modal', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    await s.preview(theme({ source: 'manual' }));
    expect(notified.at(-1)).toMatchObject({ palette: null, forSource: 'manual' });
    expect(applied.at(-1)?.accent).toBeUndefined();
  });

  test('an update of the saved source reaches a preview of the same source', async () => {
    const saved = theme({ source: 'caelestia' });
    const s = new ThemeState(deps);
    await s.start(saved);
    await s.preview({ ...saved, overrides: { '--color-divider-main': '#000000' } });
    watchers[0].onUpdate(ok('#555555'));
    await flush();
    expect(applied.at(-1)).toMatchObject({ accent: '#555555', transition: false });
    expect(notified.at(-1)).toMatchObject({ palette: pal('#555555') });
  });

  test('save with the same source keeps the watcher', async () => {
    const saved = theme({ source: 'caelestia' });
    const s = new ThemeState(deps);
    await s.start(saved);
    await s.save({ ...saved, colors: { ...saved.colors, text: '#ffffff' } });
    expect(watchers).toHaveLength(1);
    expect(watchers[0].stopped).toBe(false);
    expect(applied.at(-1)?.transition).toBe(true);
  });

  test('save with a new source restarts the watcher, seeded with the previewed palette', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    await s.preview(theme({ source: 'pywal' }));
    await s.save(theme({ source: 'pywal' }));
    expect(watchers[0].stopped).toBe(true);
    expect(watchers[1]).toMatchObject({ source: 'pywal', initial: pal('#bada55'), stopped: false });
    expect(readCalls).toEqual(['caelestia', 'pywal']);
    expect(applied.at(-1)).toEqual({ source: 'pywal', accent: '#bada55', transition: true });
  });

  test('late updates from a stopped watcher are ignored', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    const old = watchers[0];
    await s.save(theme({ source: 'pywal' }));
    const before = applied.length;
    old.onUpdate(ok('#666666'));
    await flush();
    expect(applied.length).toBe(before);
    expect(s.displayed().palette).toEqual(pal('#bada55'));
  });

  test('stop() stops the watcher and ignores late callbacks', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    s.stop();
    expect(watchers[0].stopped).toBe(true);
    watchers[0].onUpdate(ok('#777777'));
    await flush();
    expect(applied).toEqual([]);
  });

  test('rapid previews: a slow read for an older draft does not apply over a newer one', async () => {
    let release!: () => void;
    deps.readOnce = (t) => (t.source === 'pywal'
      ? new Promise<SourceUpdate>((r) => { release = () => r(ok('#bada55')); })
      : Promise.resolve(reads[t.source]));
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'manual' }));
    const slow = s.preview(theme({ source: 'pywal' }));
    await s.preview(theme({ source: 'manual', colors: { ...DEFAULT_THEME.colors, accent: '#010101' } }));
    release();
    await slow;
    expect(s.displayed().theme.source).toBe('manual');
    expect(applied.at(-1)?.source).toBe('manual');
  });

  test('a page reload during a preview drops the unsaved draft (review #1)', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    await s.documentReady();
    s.setModalOpen(true);
    await s.preview(theme({ source: 'pywal' }));
    // The page reloads: the modal is gone without sending cancel.
    await s.documentReady();
    expect(applied.at(-1)).toEqual({ source: 'caelestia', accent: '#caeca0', transition: false });
    expect(s.displayed().theme.source).toBe('caelestia');
    clock += 5000;
    watchers[0].onUpdate(ok('#888888'));
    await flush();
    expect(applied.at(-1)).toEqual({ source: 'caelestia', accent: '#888888', transition: true });
  });

  test('no fade before the first page is ready (review #4)', async () => {
    const s = new ThemeState(deps);
    await s.start(theme({ source: 'caelestia' }));
    watchers[0].onUpdate(ok('#999999'));
    await flush();
    expect(applied.every((a) => !a.transition)).toBe(true);
  });
});
