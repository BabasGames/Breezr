import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { version } from '../../package.json';
import { validateConfig, type BreezrConfig } from '../shared/config-schema';
import { isRtl } from '../shared/i18n';
import type { SettingsSnapshot } from '../shared/settings-types';
import { isDeezerUrl } from '../shared/origin';
import type { ThemeConfig } from '../shared/theme-model';
import { EN, MESSAGES } from '../locales';
import * as Config from './config';
import { currentLocale, notifyLocaleChange } from './i18n';
import { log } from './log';
import { applyTheme } from './theme';

function snapshot(app: Electron.App): SettingsSnapshot {
  const locale = currentLocale();
  return {
    config: Config.getAll(app),
    locale,
    dir: isRtl(locale) ? 'rtl' : 'ltr',
    messages: MESSAGES[locale],
    fallback: EN,
    version,
  };
}

export function registerSettings(app: Electron.App, win: BrowserWindow) {
  // Only Deezer's top frame in the main window may read or change settings: login popups and
  // third-party scripts in iframes also get the preload, and must not reach these channels.
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && isDeezerUrl(event.senderFrame?.url);
  const reject = (channel: string, event: IpcMainEvent | IpcMainInvokeEvent) =>
    log('Settings', 'Ignored', channel, 'from untrusted sender', event.senderFrame?.url ?? '(unknown)');

  ipcMain.handle('breezr:settings:get', (event) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    return snapshot(app);
  });

  ipcMain.on('breezr:settings:preview', (event, theme: ThemeConfig) => {
    if (!trusted(event)) return reject('preview', event);
    const { config } = validateConfig({ ...Config.getAll(app), theme });
    applyTheme(win.webContents, config.theme, null, { transition: false });
  });

  ipcMain.handle('breezr:settings:save', async (event, raw: BreezrConfig) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    const current = Config.getAll(app);
    // The window size is owned by the main process; never let the renderer overwrite it.
    const { config, warnings } = validateConfig({ ...raw, window_width: current.window_width, window_height: current.window_height });
    for (const warning of warnings) log('Settings', warning);
    Config.setAll(app, config);
    // Answer only once the page shows the saved theme, so the modal never closes on stale colors.
    await applyTheme(win.webContents, config.theme, null, { transition: config.theme.smoothTransitions });
    notifyLocaleChange();
    return snapshot(app);
  });

  ipcMain.on('breezr:settings:cancel', (event) => {
    if (!trusted(event)) return reject('cancel', event);
    applyTheme(win.webContents, Config.get(app, 'theme'), null, { transition: false });
  });
}

export function openSettings(win: BrowserWindow) {
  if (!win.isVisible()) win.show();
  win.focus();
  win.webContents.send('breezr:settings:open');
}
