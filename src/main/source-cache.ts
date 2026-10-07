import { readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ExternalPalette } from '../shared/palette';
import { log } from './log';

// Last valid palette of each source, so a restart shows the source's colours right away instead of
// flashing the manual ones until the file has been read. Purely an optimisation: any error is swallowed.

const FILE = 'theme-source-cache.json';

function readAll(dir: string): Record<string, unknown> {
  try {
    const data = JSON.parse(readFileSync(join(dir, FILE), 'utf-8'));
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

const isPalette = (v: unknown): v is ExternalPalette =>
  typeof v === 'object' && v !== null && typeof (v as { colors?: unknown }).colors === 'object' && (v as { colors?: unknown }).colors !== null;

export function loadSourceCache(dir: string, key: string): ExternalPalette | null {
  const entry = readAll(dir)[key];
  return isPalette(entry) ? entry : null;
}

export function saveSourceCache(dir: string, key: string, palette: ExternalPalette): void {
  try {
    const all = readAll(dir);
    all[key] = palette;
    const tmp = join(dir, `${FILE}.tmp`);
    writeFileSync(tmp, JSON.stringify(all));
    renameSync(tmp, join(dir, FILE));
  } catch (e) {
    log('Theme', 'Could not write the palette cache:', String(e));
  }
}
