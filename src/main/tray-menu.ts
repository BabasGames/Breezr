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

export interface TrayItem {
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
  label?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: TrayItem[];
  click?: () => void;
}

const MAX_TRACK_LABEL = 64;

function clip(text: string): string {
  return text.length <= MAX_TRACK_LABEL ? text : `${text.slice(0, MAX_TRACK_LABEL - 1).trimEnd()}…`;
}

export function buildTrayTemplate(
  state: PlaybackState | null, t: (key: string) => string, actions: TrayActions,
  opts: { updates: boolean; version: string },
): TrayItem[] {
  const playback: TrayItem[] = state
    ? [
      { label: clip(`♪ ${state.title} · ${state.artists}`), enabled: false },
      { label: `⏮ ${t('tray.previous')}`, enabled: state.hasPrev, click: actions.previous },
      { label: state.playing ? `⏸ ${t('tray.pause')}` : `▶ ${t('tray.play')}`, click: actions.togglePause },
      { label: `⏭ ${t('tray.next')}`, enabled: state.hasNext, click: actions.next },
      { type: 'checkbox', label: t('tray.shuffle'), checked: state.shuffle, click: () => actions.setShuffle(!state.shuffle) },
      {
        type: 'submenu', label: t('tray.repeat'),
        submenu: ([[0, 'tray.repeatOff'], [1, 'tray.repeatAll'], [2, 'tray.repeatOne']] as const).map(([mode, key]) => ({
          type: 'radio' as const, label: t(key), checked: state.repeat === mode, click: () => actions.setRepeat(mode),
        })),
      },
      ...(state.liked === null ? [] : [{ label: `♥ ${t(state.liked ? 'tray.unlike' : 'tray.like')}`, click: actions.toggleLike }]),
    ]
    : [{ label: t('tray.nothingPlaying'), enabled: false }];
  return [
    ...playback,
    { type: 'separator' },
    { label: t('tray.open'), click: actions.open },
    { label: t('tray.settings'), click: actions.settings },
    ...(opts.updates ? [{ label: t('tray.checkUpdates'), click: actions.checkUpdates }] : []),
    { label: opts.version, enabled: false },
    { type: 'separator' },
    { label: t('tray.quit'), click: actions.quit },
  ];
}
