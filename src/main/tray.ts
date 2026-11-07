import { join } from 'path';
import updater, { updatesEnabled } from './updater';
import * as RPC from './rpc/client';
import { Menu, Tray, nativeImage, nativeTheme, type NativeImage } from 'electron';
import { version } from '../../package.json';
import { win } from './window';
import { t, onLocaleChange } from './i18n';
import { openSettings } from './settings';
import { buildTrayTemplate, type MenuIcon, type PlaybackState } from './tray-menu';
import { playbackControls, readPlayback } from './playback';

const imgDir = join(__dirname, '..', 'img');
const iconPath = join(imgDir, 'tray.png');

const menuIcons = new Map<string, NativeImage>();

/**
 * The menu icons ship as white masks; this paints them the colour of the menu's text, dimmed like the label
 * on greyed-out items. macOS gets template images, which the system recolours itself.
 */
function menuIcon(name: MenuIcon, enabled: boolean): NativeImage {
  const mac = process.platform === 'darwin';
  const dark = !mac && nativeTheme.shouldUseDarkColors;
  const key = `${name}:${enabled}:${dark}`;
  const cached = menuIcons.get(key);
  if (cached) return cached;
  const [r, g, b] = dark ? [232, 232, 232] : [31, 31, 31];
  const opacity = enabled || mac ? 1 : 0.4;
  const mask = nativeImage.createFromPath(join(imgDir, `menu-${name}.png`));
  const icon = nativeImage.createEmpty();
  for (const scaleFactor of mask.getScaleFactors()) {
    const { width, height } = mask.getSize(scaleFactor);
    // Raw bitmaps are premultiplied BGRA, so every channel scales with the new alpha.
    const pixels = mask.toBitmap({ scaleFactor });
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] * opacity;
      pixels[i] = Math.round((b * alpha) / 255);
      pixels[i + 1] = Math.round((g * alpha) / 255);
      pixels[i + 2] = Math.round((r * alpha) / 255);
      pixels[i + 3] = Math.round(alpha);
    }
    icon.addRepresentation({ scaleFactor, width: width * scaleFactor, height: height * scaleFactor, buffer: pixels });
  }
  if (mac) icon.setTemplateImage(true);
  menuIcons.set(key, icon);
  return icon;
}

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
  nativeTheme.on('updated', () => {
    menuIcons.clear();
    refreshTrayMenu();
  });
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
  tray.setContextMenu(Menu.buildFromTemplate(items.map((item) => ({
    ...item, icon: item.icon && menuIcon(item.icon, item.enabled !== false),
  }))));
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
