import type { BrowserWindow } from 'electron';

export function openSettings(win: BrowserWindow) {
  if (!win.isVisible()) win.show();
  win.focus();
  win.webContents.send('breezr:settings:open');
}
