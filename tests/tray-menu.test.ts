import { describe, expect, test } from 'bun:test';
import { buildTrayTemplate, type PlaybackState } from '../src/main/tray-menu';

const t = (key: string) => key;
const noop = () => undefined;
const actions = {
  previous: noop, togglePause: noop, next: noop, setShuffle: noop, setRepeat: noop, toggleLike: noop,
  open: noop, settings: noop, checkUpdates: noop, quit: noop,
};
const playing: PlaybackState = {
  title: 'Another One Bites the Dust', artists: 'Queen', playing: true, hasPrev: true, hasNext: false,
  shuffle: true, repeat: 2, liked: false,
};
const build = (state: PlaybackState | null, opts = { updates: true, version: 'Version 2.3.0' }) =>
  buildTrayTemplate(state, t, actions, opts);
const labels = (items: ReturnType<typeof build>) => items.map((i) => (i.type === 'separator' ? '---' : i.label));

describe('tray menu', () => {
  test('playback first, then the app, then quit; no settings left in the tray', () => {
    expect(labels(build(playing))).toEqual([
      'Another One Bites the Dust · Queen',
      'tray.previous', 'tray.pause', 'tray.next', 'tray.shuffleOn', 'tray.repeatOne', 'tray.like',
      '---',
      'tray.open', 'tray.settings', 'tray.checkUpdates', 'Version 2.3.0',
      '---',
      'tray.quit',
    ]);
  });

  test('the current track line is informative only', () => {
    expect(build(playing)[0].enabled).toBe(false);
  });

  test('paused: the middle item offers to play', () => {
    expect(labels(build({ ...playing, playing: false }))[2]).toBe('tray.play');
  });

  test('previous/next are greyed out when there is nothing before/after', () => {
    const items = build(playing);
    expect(items[1].enabled).toBe(true);
    expect(items[3].enabled).toBe(false);
  });

  test('every item has an icon, separators aside', () => {
    for (const state of [playing, null]) {
      expect(build(state).every((i) => i.type === 'separator' || i.icon !== undefined)).toBe(true);
    }
  });

  test('shuffle and repeat show their state in the label and the icon (no check marks needed)', () => {
    expect(build(playing)[4]).toMatchObject({ label: 'tray.shuffleOn', icon: 'shuffle-on' });
    expect(build({ ...playing, shuffle: false })[4]).toMatchObject({ label: 'tray.shuffleOff', icon: 'shuffle' });
    const repeat = ([0, 1, 2] as const).map((mode) => build({ ...playing, repeat: mode })[5]);
    expect(repeat.map((r) => [r.label, r.icon])).toEqual([
      ['tray.repeatOff', 'repeat'], ['tray.repeatAll', 'repeat-on'], ['tray.repeatOne', 'repeat-one-on'],
    ]);
  });

  test('the like item flips its wording and its heart', () => {
    expect(build(playing)[6]).toMatchObject({ label: 'tray.like', icon: 'like' });
    expect(build({ ...playing, liked: true })[6]).toMatchObject({ label: 'tray.unlike', icon: 'liked' });
  });

  test('the like item disappears when Deezer\'s own heart button cannot be found', () => {
    expect(labels(build({ ...playing, liked: null }))).not.toContain('tray.like');
  });

  test('nothing loaded: a single greyed line instead of the controls', () => {
    const items = build(null);
    expect(labels(items).slice(0, 2)).toEqual(['tray.nothingPlaying', '---']);
    expect(items[0].enabled).toBe(false);
  });

  test('very long titles are shortened', () => {
    const label = build({ ...playing, title: 'x'.repeat(200) })[0].label!;
    expect(label.length).toBeLessThanOrEqual(64);
    expect(label.endsWith('…')).toBe(true);
  });

  test('no update entry when updates are handled elsewhere (AUR, Nix)', () => {
    expect(labels(build(playing, { updates: false, version: 'v' }))).not.toContain('tray.checkUpdates');
  });

  test('items call their actions', () => {
    const calls: string[] = [];
    const spy = new Proxy({}, { get: (_, name) => (...args: unknown[]) => calls.push(`${String(name)}${args.length ? `(${args.join(',')})` : ''}`) });
    const items = buildTrayTemplate(playing, t, spy as typeof actions, { updates: true, version: 'v' });
    for (const i of [2, 4, 5, 6]) (items[i].click as () => void)();
    expect(calls).toEqual(['togglePause', 'setShuffle(false)', 'setRepeat(0)', 'toggleLike']);
  });

  test('repeat steps through Deezer\'s order: off, whole list, this track, off', () => {
    const next = ([0, 1, 2] as const).map((mode) => {
      let picked = -1;
      const items = buildTrayTemplate({ ...playing, repeat: mode }, t, { ...actions, setRepeat: (m) => { picked = m; } }, { updates: true, version: 'v' });
      (items[5].click as () => void)();
      return picked;
    });
    expect(next).toEqual([1, 2, 0]);
  });
});
