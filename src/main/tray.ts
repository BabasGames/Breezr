import { join } from 'path';
import updater, { updatesEnabled } from './updater';
import * as RPC from './rpc/client';
import { Menu, Tray } from 'electron';
import { version } from '../../package.json';
import { win } from './window';
import { t, onLocaleChange } from './i18n';
import { openSettings } from './settings';
import { buildTrayTemplate, type PlaybackState } from './tray-menu';
import { playbackControls, readPlayback } from './playback';

const iconPath = join(__dirname, '..', 'img', 'tray.png');

export let tray: Tray | null = null;
let appRef: Electron.App;
export async function init(app: Electron.App) {
  appRef = app;
  await app.whenReady();
  tray = new Tray(iconPath);
  tray.setToolTip('Breezr');
  tray.on('click', () => {
    if (!win.isVisible()) win.show();
  });
  refreshTrayMenu();
  onLocaleChange(refreshTrayMenu);
}

let playback: PlaybackState | null = null;
let shownKey = '';

/** Rebuilds the menu: labels follow the current language, playback items follow the player. */
export function refreshTrayMenu() {
  if (!tray) return;
  const app = appRef;
  const debug = process.argv0.includes('node');
  // A control changes the player a moment later: read it again to show the new state.
  const thenRefresh = (action: () => unknown) => () => {
    void Promise.resolve(action()).then(() => setTimeout(() => void updateTrayPlayback(), 400));
  };
  const items = buildTrayTemplate(playback, (key) => t(key), {
    previous: thenRefresh(playbackControls.previous),
    togglePause: thenRefresh(playbackControls.togglePause),
    next: thenRefresh(playbackControls.next),
    setShuffle: (on) => thenRefresh(() => playbackControls.setShuffle(on))(),
    setRepeat: (mode) => thenRefresh(() => playbackControls.setRepeat(mode))(),
    toggleLike: thenRefresh(playbackControls.toggleLike),
    open: () => win.show(),
    settings: () => openSettings(win),
    checkUpdates: () => void updater(),
    quit: () => {
      RPC.disconnect().catch(console.error);
      win.close();
      app.quit();
      process.exit(0);
    },
  }, { updates: updatesEnabled, version: t(debug ? 'tray.versionDebug' : 'tray.version', { version }) });
  tray.setContextMenu(Menu.buildFromTemplate(items as Electron.MenuItemConstructorOptions[]));
}

/** Reads the player and rebuilds the menu only when something shown changed (no flicker every poll). */
export async function updateTrayPlayback() {
  if (!tray) return;
  const next = await readPlayback();
  const key = JSON.stringify(next);
  if (key === shownKey) return;
  shownKey = key;
  playback = next;
  refreshTrayMenu();
}
