import { join } from 'path';
import { homedir } from 'os';
import { writeFileSync } from 'fs';
import { dialog } from 'electron';
import type { BreezrConfig } from '../shared/config-schema';
import { readConfigFile } from './config-file';
import { log } from './log';
import { win } from './window';
import { t } from './i18n';

let cache: BreezrConfig | null = null;

function getConfigPath(app: Electron.App) {
  return join(app.getPath('userData'), 'config.json');
}

function load(app: Electron.App): BreezrConfig {
  const { config, warnings } = readConfigFile(getConfigPath(app), homedir());
  for (const warning of warnings) log('Config', warning);
  return config;
}

export function getAll(app: Electron.App): BreezrConfig {
  cache ??= load(app);
  return structuredClone(cache);
}

export function get<K extends keyof BreezrConfig>(app: Electron.App, key: K): BreezrConfig[K] {
  return getAll(app)[key];
}

export function setAll(app: Electron.App, config: BreezrConfig) {
  cache = structuredClone(config);
  const path = getConfigPath(app);
  try {
    writeFileSync(path, JSON.stringify(config, null, 2));
  } catch (e) {
    dialog.showMessageBox(win, {
      type: 'error',
      buttons: [t('config.writeError.close')],
      title: t('config.writeError.title'),
      message: t('config.writeError.message', { path }),
      detail: e?.toString(),
      defaultId: 0,
    });
  }
}

export function set<K extends keyof BreezrConfig>(app: Electron.App, key: K, value: BreezrConfig[K]) {
  setAll(app, { ...getAll(app), [key]: value });
}
