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
      '♪ Another One Bites the Dust · Queen',
      '⏮ tray.previous', '⏸ tray.pause', '⏭ tray.next', 'tray.shuffle', 'tray.repeat', '♥ tray.like',
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
    expect(labels(build({ ...playing, playing: false }))[2]).toBe('▶ tray.play');
  });

  test('previous/next are greyed out when there is nothing before/after', () => {
    const items = build(playing);
    expect(items[1].enabled).toBe(true);
    expect(items[3].enabled).toBe(false);
  });

  test('shuffle is a checkbox, repeat a choice of three, the like item flips its wording', () => {
    const items = build(playing);
    expect(items[4]).toMatchObject({ type: 'checkbox', checked: true });
    const repeat = items[5].submenu as { label: string; type: string; checked: boolean }[];
    expect(repeat.map((r) => [r.label, r.checked])).toEqual([['tray.repeatOff', false], ['tray.repeatAll', false], ['tray.repeatOne', true]]);
    expect(repeat.every((r) => r.type === 'radio')).toBe(true);
    expect(labels(build({ ...playing, liked: true }))[6]).toBe('♥ tray.unlike');
  });

  test('the like item disappears when Deezer\'s own heart button cannot be found', () => {
    expect(labels(build({ ...playing, liked: null }))).not.toContain('♥ tray.like');
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
    (items[2].click as () => void)();
    (items[4].click as () => void)();
    ((items[5].submenu as { click: () => void }[])[0].click)();
    (items[6].click as () => void)();
    expect(calls).toEqual(['togglePause', 'setShuffle(false)', 'setRepeat(0)', 'toggleLike']);
  });
});
