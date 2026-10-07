import { join } from 'path';
import updater, { updatesEnabled } from './updater';
import * as Config from './config';
import * as RPC from './rpc/client';
import { Menu, Tray } from 'electron';
import { version } from '../../package.json';
import { log } from './log';
import { win } from './window';
import { t, onLocaleChange } from './i18n';
import { openSettings } from './settings';
import { STATUS_NAMES, TOOLTIP_TEXTS } from '../shared/config-schema';

const iconPath = join(__dirname, '..', 'img', 'tray.png');

export let tray: Tray | null = null;
let appRef: Electron.App;
let clientRef: import('@xhayper/discord-rpc').Client;

export async function init(app: Electron.App, client: import('@xhayper/discord-rpc').Client) {
  appRef = app;
  clientRef = client;
  await app.whenReady();
  tray = new Tray(iconPath);
  tray.setToolTip('Breezr');
  tray.on('click', () => {
    if (!win.isVisible()) win.show();
  });
  refreshTrayMenu();
  onLocaleChange(refreshTrayMenu);
}

/** Rebuilds the menu: labels follow the current language, radios and checkbox follow the config. */
export function refreshTrayMenu() {
  if (!tray) return;
  const app = appRef;
  const debug = process.argv0.includes('node');
  const statusName = Config.get(app, 'status_name');
  const tooltipText = Config.get(app, 'tooltip_text');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('tray.open'), type: 'normal', click: () => win.show() },
    { label: t(debug ? 'tray.versionDebug' : 'tray.version', { version }), type: 'normal', enabled: false },
    { label: t('tray.checkUpdates'), type: 'normal', visible: updatesEnabled, click: () => updater() },
    { label: t('tray.settings'), type: 'normal', click: () => openSettings(win) },
    { type: 'separator' },
    {
      label: t('tray.statusName'), type: 'submenu', submenu: STATUS_NAMES.map((id) => ({
        label: t(`option.statusName.${id}`), type: 'radio' as const, id, checked: statusName === id,
        click: () => Config.set(app, 'status_name', id),
      })),
    },
    {
      label: t('tray.tooltipText'), type: 'submenu', submenu: TOOLTIP_TEXTS.map((id) => ({
        label: t(`option.tooltip.${id}`), type: 'radio' as const, id, checked: tooltipText === id,
        click: () => Config.set(app, 'tooltip_text', id),
      })),
    },
    {
      label: t('tray.dontCloseToTray'), type: 'checkbox', checked: Config.get(app, 'dont_close_to_tray'),
      click: (menuItem) => Config.set(app, 'dont_close_to_tray', menuItem.checked),
    },
    {
      id: 'reconnect', label: t('tray.reconnect'), type: 'normal', visible: false,
      click: () => {
        clientRef.login().then(() => log('RPC', 'Reconnected')).catch(console.error);
      },
    },
    { type: 'separator' },
    {
      label: t('tray.quit'), type: 'normal', click: async () => {
        RPC.disconnect().catch(console.error);
        win.close();
        app.quit();
        process.exit(0);
      },
    },
  ]));
}
