import { existsSync, readFileSync, renameSync } from 'fs';
import { DEFAULT_CONFIG, validateConfig, type BreezrConfig } from '../shared/config-schema';

/**
 * Reads and validates config.json without ever throwing: the app must start even when the file is missing,
 * corrupt, or unreadable (permissions). A corrupt file is kept aside as config.json.bak-<date> when possible.
 * No Electron import, so it can be unit-tested.
 */
export function readConfigFile(path: string, home = ''): { config: BreezrConfig; warnings: string[] } {
  if (!existsSync(path)) return { config: structuredClone(DEFAULT_CONFIG), warnings: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    const warnings = [`Unreadable config (${String(e)}), using defaults`];
    const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      renameSync(path, backup);
      warnings.push(`Unreadable config moved to ${backup}`);
    } catch (renameError) {
      warnings.push(`Could not move the unreadable config aside: ${String(renameError)}`);
    }
    return { config: structuredClone(DEFAULT_CONFIG), warnings };
  }
  return validateConfig(raw, { home });
}
