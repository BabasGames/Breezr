// The tray menu as plain data (no Electron import), so it can be tested; tray.ts turns it into a Menu.

/** What the tray shows of the player; null when nothing is loaded. `liked` null: Deezer's heart not found. */
export interface PlaybackState {
  title: string;
  artists: string;
  playing: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  shuffle: boolean;
  /** Deezer's repeat modes: 0 off, 1 the whole list, 2 the current track. */
  repeat: 0 | 1 | 2;
  liked: boolean | null;
}

export interface TrayActions {
  previous(): void;
  togglePause(): void;
  next(): void;
  setShuffle(on: boolean): void;
  setRepeat(mode: 0 | 1 | 2): void;
  toggleLike(): void;
  open(): void;
  settings(): void;
  checkUpdates(): void;
  quit(): void;
}

/** Icons shipped as src/img/menu-<name>.png (white masks, tinted by tray.ts). */
export type MenuIcon =
  | 'track' | 'previous' | 'play' | 'pause' | 'next' | 'shuffle' | 'shuffle-on' | 'repeat' | 'repeat-on'
  | 'repeat-one-on' | 'like' | 'liked' | 'open' | 'settings' | 'update' | 'info' | 'quit';

/**
 * Shuffle and repeat are plain items whose label and icon show the current state: some tray hosts (Quickshell,
 * for one) draw neither check marks nor radio dots, so a checkbox would hide whether shuffle is on.
 */
export interface TrayItem {
  type?: 'normal' | 'separator';
  label?: string;
  icon?: MenuIcon;
  enabled?: boolean;
  click?: () => void;
}

const REPEAT: Record<0 | 1 | 2, { key: string; icon: MenuIcon; next: 0 | 1 | 2 }> = {
  0: { key: 'tray.repeatOff', icon: 'repeat', next: 1 },
  1: { key: 'tray.repeatAll', icon: 'repeat-on', next: 2 },
  2: { key: 'tray.repeatOne', icon: 'repeat-one-on', next: 0 },
};

const MAX_TRACK_LABEL = 64;

function clip(text: string): string {
  return text.length <= MAX_TRACK_LABEL ? text : `${text.slice(0, MAX_TRACK_LABEL - 1).trimEnd()}…`;
}

export function buildTrayTemplate(
  state: PlaybackState | null, t: (key: string) => string, actions: TrayActions,
  opts: { updates: boolean; version: string },
): TrayItem[] {
  const repeat = state && REPEAT[state.repeat];
  const playback: TrayItem[] = state && repeat
    ? [
      { label: clip(`${state.title} · ${state.artists}`), icon: 'track', enabled: false },
      { label: t('tray.previous'), icon: 'previous', enabled: state.hasPrev, click: actions.previous },
      state.playing
        ? { label: t('tray.pause'), icon: 'pause', click: actions.togglePause }
        : { label: t('tray.play'), icon: 'play', click: actions.togglePause },
      { label: t('tray.next'), icon: 'next', enabled: state.hasNext, click: actions.next },
      {
        label: t(state.shuffle ? 'tray.shuffleOn' : 'tray.shuffleOff'), icon: state.shuffle ? 'shuffle-on' : 'shuffle',
        click: () => actions.setShuffle(!state.shuffle),
      },
      { label: t(repeat.key), icon: repeat.icon, click: () => actions.setRepeat(repeat.next) },
      ...(state.liked === null ? [] : [{
        label: t(state.liked ? 'tray.unlike' : 'tray.like'), icon: state.liked ? 'liked' as const : 'like' as const,
        click: actions.toggleLike,
      }]),
    ]
    : [{ label: t('tray.nothingPlaying'), icon: 'track', enabled: false }];
  return [
    ...playback,
    { type: 'separator' },
    { label: t('tray.open'), icon: 'open', click: actions.open },
    { label: t('tray.settings'), icon: 'settings', click: actions.settings },
    ...(opts.updates ? [{ label: t('tray.checkUpdates'), icon: 'update' as const, click: actions.checkUpdates }] : []),
    { label: opts.version, icon: 'info', enabled: false },
    { type: 'separator' },
    { label: t('tray.quit'), icon: 'quit', click: actions.quit },
  ];
}
