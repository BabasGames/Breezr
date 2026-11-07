import { clipboard, ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { version } from '../../package.json';
import { validateConfig, type BreezrConfig } from '../shared/config-schema';
import { isRtl } from '../shared/i18n';
import type { SettingsSnapshot } from '../shared/settings-types';
import { isDeezerUrl } from '../shared/origin';
import { displayPath, publicSourceKey } from '../shared/palette';
import type { ThemeConfig } from '../shared/theme-model';
import { EN, MESSAGES } from '../locales';
import * as Config from './config';
import { currentLocale, notifyLocaleChange } from './i18n';
import { log } from './log';
import type { ThemeState } from './theme-state';
import { defaultPathsForDisplay } from './theme-runtime';
import { applyPageTweaks } from './page-tweaks';
import { homedir } from 'os';
import { liveLink } from './live-runtime';

/** The config as the page may see it: source paths with the home folder shortened to ~ (re-expanded on save). */
function pageConfig(app: Electron.App): BreezrConfig {
  const config = Config.getAll(app);
  const home = homedir();
  config.theme.sourcePaths = {
    caelestia: config.theme.sourcePaths.caelestia && displayPath(config.theme.sourcePaths.caelestia, home),
    pywal: config.theme.sourcePaths.pywal && displayPath(config.theme.sourcePaths.pywal, home),
  };
  return config;
}

function snapshot(app: Electron.App, state: ThemeState): SettingsSnapshot {
  const locale = currentLocale();
  return {
    config: pageConfig(app),
    locale,
    dir: isRtl(locale) ? 'rtl' : 'ltr',
    messages: MESSAGES[locale],
    fallback: EN,
    version,
    source: { ...state.savedSource(), forSource: publicSourceKey(state.savedSource().forSource, homedir()) },
    defaultPaths: defaultPathsForDisplay(),
    liveUrl: Config.get(app, 'live_link') ? liveLink(app).url() : null,
  };
}

export function registerSettings(app: Electron.App, win: BrowserWindow, state: ThemeState, onLiveChange: () => void) {
  // Only Deezer's top frame in the main window may read or change settings: login popups and
  // third-party scripts in iframes also get the preload, and must not reach these channels.
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && isDeezerUrl(event.senderFrame?.url);
  const reject = (channel: string, event: IpcMainEvent | IpcMainInvokeEvent) =>
    log('Settings', 'Ignored', channel, 'from untrusted sender', event.senderFrame?.url ?? '(unknown)');

  ipcMain.handle('breezr:settings:get', (event) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    state.setModalOpen(true);
    return snapshot(app, state);
  });

  ipcMain.on('breezr:settings:preview', (event, theme: ThemeConfig) => {
    if (!trusted(event)) return reject('preview', event);
    const { config } = validateConfig({ ...Config.getAll(app), theme }, { home: homedir() });
    void state.preview(config.theme);
  });

  ipcMain.handle('breezr:settings:save', async (event, raw: BreezrConfig) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    const current = Config.getAll(app);
    // The window size is owned by the main process; never let the renderer overwrite it.
    const { config, warnings } = validateConfig({ ...raw, window_width: current.window_width, window_height: current.window_height }, { home: homedir() });
    for (const warning of warnings) log('Settings', warning);
    Config.setAll(app, config);
    if (config.live_link !== current.live_link) {
      if (config.live_link) await liveLink(app).enable();
      else await liveLink(app).disable();
    }
    if (config.live_link !== current.live_link || config.live_link_discord !== current.live_link_discord
      || config.live_link_show_viewers !== current.live_link_show_viewers) onLiveChange();
    void applyPageTweaks(win.webContents, { animateSidebar: config.animate_sidebar });
    state.setModalOpen(false);
    // Answer only once the page shows the saved theme, so the modal never closes on stale colors.
    await state.save(config.theme);
    notifyLocaleChange();
    return snapshot(app, state);
  });

  ipcMain.handle('breezr:live:share', async (event) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    const wasOn = Config.get(app, 'live_link');
    if (!wasOn) Config.set(app, 'live_link', true);
    const url = await liveLink(app).enable();
    clipboard.writeText(url);
    if (!wasOn) onLiveChange();
    return { url };
  });

  // An action, not a draft setting: turning the link on must show it at once, turning it off deletes it.
  ipcMain.handle('breezr:live:set', async (event, on: boolean) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    const enable = on === true;
    const changed = Config.get(app, 'live_link') !== enable;
    Config.set(app, 'live_link', enable);
    let url: string | null = null;
    if (enable) url = await liveLink(app).enable();
    else await liveLink(app).disable();
    if (changed) onLiveChange();
    return { url };
  });

  ipcMain.handle('breezr:live:viewers', async (event) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    return { viewers: Config.get(app, 'live_link') ? await liveLink(app).viewers() : null };
  });

  ipcMain.handle('breezr:live:renew', async (event) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    if (!Config.get(app, 'live_link')) throw new Error('Live link is off');
    const url = await liveLink(app).renew();
    onLiveChange();
    return { url };
  });

  ipcMain.on('breezr:settings:cancel', (event) => {
    if (!trusted(event)) return reject('cancel', event);
    state.setModalOpen(false);
    void state.cancel();
  });
}

export function openSettings(win: BrowserWindow) {
  if (!win.isVisible()) win.show();
  win.focus();
  win.webContents.send('breezr:settings:open');
}
