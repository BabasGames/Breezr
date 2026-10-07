import { ipcMain, type BrowserWindow } from 'electron';
import { version } from '../../package.json';
import { validateConfig, type BreezrConfig } from '../shared/config-schema';
import { isRtl } from '../shared/i18n';
import type { SettingsSnapshot } from '../shared/settings-types';
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
  ipcMain.handle('breezr:settings:get', () => snapshot(app));

  ipcMain.on('breezr:settings:preview', (_event, theme: ThemeConfig) => {
    const { config } = validateConfig({ ...Config.getAll(app), theme });
    applyTheme(win.webContents, config.theme);
  });

  ipcMain.handle('breezr:settings:save', async (_event, raw: BreezrConfig) => {
    const current = Config.getAll(app);
    // The window size is owned by the main process; never let the renderer overwrite it.
    const { config, warnings } = validateConfig({ ...raw, window_width: current.window_width, window_height: current.window_height });
    for (const warning of warnings) log('Settings', warning);
    Config.setAll(app, config);
    // Answer only once the page shows the saved theme, so the modal never closes on stale colors.
    await applyTheme(win.webContents, config.theme);
    notifyLocaleChange();
    return snapshot(app);
  });

  ipcMain.on('breezr:settings:cancel', () => {
    applyTheme(win.webContents, Config.get(app, 'theme'));
  });
}

export function openSettings(win: BrowserWindow) {
  if (!win.isVisible()) win.show();
  win.focus();
  win.webContents.send('breezr:settings:open');
}
