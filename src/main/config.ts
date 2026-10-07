import { join } from 'path';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dialog } from 'electron';
import { DEFAULT_CONFIG, validateConfig, type BreezrConfig } from '../shared/config-schema';
import { log } from './log';
import { win } from './window';

let cache: BreezrConfig | null = null;

function getConfigPath(app: Electron.App) {
  return join(app.getPath('userData'), 'config.json');
}

function load(app: Electron.App): BreezrConfig {
  const path = getConfigPath(app);
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    // Keep the broken file for the user instead of silently overwriting it.
    const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(path, backup);
    log('Config', 'Unreadable config moved to', backup, String(e));
    return structuredClone(DEFAULT_CONFIG);
  }
  const { config, warnings } = validateConfig(raw);
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
      buttons: ['Close'],
      title: 'Failed to write config file',
      message: `An error occurred while writing to ${path}`,
      detail: e?.toString(),
      defaultId: 0,
    });
  }
}

export function set<K extends keyof BreezrConfig>(app: Electron.App, key: K, value: BreezrConfig[K]) {
  setAll(app, { ...getAll(app), [key]: value });
}
