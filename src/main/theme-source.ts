import { promises as fsp, unwatchFile, watch, watchFile, type FSWatcher } from 'fs';
import { basename, dirname } from 'path';
import { displayPath, paletteFingerprint, type ExternalPalette, type SourceState, type SourceStatus, type SourceUpdate } from '../shared/palette';
import { readBoundedText } from './read-bounded';

// No Electron import: this module is tested with bun against real temporary files.

export interface SourceHandle { stop(): void }

export interface FileSourceOptions {
  /** Path chosen by the user (absolute), possibly a symlink. */
  path: string;
  parse: (raw: unknown) => ExternalPalette | null;
  /** For displayPath. */
  home: string;
  /** Called when the palette (by fingerprint) or the state changes. */
  onUpdate: (update: SourceUpdate) => void;
  /** Palette already applied: seeds the fingerprint so an identical first read changes nothing visible. */
  initial?: ExternalPalette | null;
  debounceMs?: number;
  retryMs?: number;
  pollMs?: number;
  now?: () => number;
}

type ReadResult = { palette: ExternalPalette | null; state: SourceState; retriable: boolean };

async function readPalette(path: string, parse: (raw: unknown) => ExternalPalette | null): Promise<ReadResult> {
  const read = await readBoundedText(path);
  if (!read.ok) return { palette: null, state: read.reason, retriable: read.reason === 'missing' };
  let palette: ExternalPalette | null;
  try {
    palette = parse(JSON.parse(read.text));
  } catch {
    palette = null;
  }
  // An empty or truncated file is usually a writer caught mid-write (pywal truncates then writes).
  return palette ? { palette, state: 'ok', retriable: false } : { palette: null, state: 'invalid', retriable: true };
}

export async function readFileSourceOnce(
  path: string, parse: (raw: unknown) => ExternalPalette | null, home: string, now: () => number = Date.now,
): Promise<SourceUpdate> {
  const { palette, state } = await readPalette(path, parse);
  const status: SourceStatus = { state, displayPath: displayPath(path, home) };
  if (state === 'ok') status.updatedAt = now();
  return { palette, status };
}

/**
 * Follows a palette file written by another program. Writers replace the file by rename (Caelestia, several
 * times per wallpaper change) or rewrite it in place (pywal), and the chosen path may be a symlink: so the
 * FOLDERS are watched (target's and link's), events are filtered by name, debounced, and only a real change
 * of palette or state is reported. A bad read keeps the last valid palette.
 */
export function watchFileSource(opts: FileSourceOptions): SourceHandle {
  const debounceMs = opts.debounceMs ?? 400;
  const retryMs = opts.retryMs ?? 200;
  const pollMs = opts.pollMs ?? 3000;
  const now = opts.now ?? Date.now;
  const shown = displayPath(opts.path, opts.home);

  let disposed = false;
  let lastPalette: ExternalPalette | null = opts.initial ?? null;
  let lastFingerprint = paletteFingerprint(lastPalette);
  let lastState: SourceState | null = null;
  let watchers: FSWatcher[] = [];
  let watchedKey = '';
  let polling = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let reading = false;
  let readAgain = false;

  const emit = (state: SourceState) => {
    if (disposed) return;
    const fingerprint = paletteFingerprint(lastPalette);
    if (fingerprint === lastFingerprint && state === lastState) return;
    lastFingerprint = fingerprint;
    lastState = state;
    const status: SourceStatus = { state, displayPath: shown };
    if (state === 'ok') status.updatedAt = now();
    else if (lastPalette) status.kept = true;
    opts.onUpdate({ palette: lastPalette, status });
  };

  const schedule = () => {
    if (disposed) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void readNow(false), debounceMs);
  };

  const closeWatchers = () => {
    for (const w of watchers) w.close();
    watchers = [];
    watchedKey = '';
    if (polling) unwatchFile(opts.path);
    polling = false;
  };

  const startPolling = () => {
    if (polling || disposed) return;
    polling = true;
    // Tolerates missing folders and fires once the file appears.
    watchFile(opts.path, { interval: pollMs }, () => schedule());
  };

  /** Watches the folders of the resolved target and of the chosen path; falls back to polling if one is missing. */
  const arm = (target: string | null) => {
    if (disposed) return;
    const dirs = new Set([dirname(target ?? opts.path), dirname(opts.path)]);
    const names = new Set([basename(target ?? opts.path), basename(opts.path)]);
    const key = [...dirs].sort().join('\n') + '\n' + [...names].sort().join('\n');
    if (key === watchedKey && (watchers.length > 0 || polling)) return;
    closeWatchers();
    try {
      for (const dir of dirs) {
        const watcher = watch(dir, (_event, name) => {
          if (!name || names.has(String(name))) schedule();
        });
        // An unhandled 'error' on an FSWatcher would crash the main process.
        watcher.on('error', () => {
          closeWatchers();
          startPolling();
          schedule();
        });
        watchers.push(watcher);
      }
      watchedKey = key;
    } catch {
      closeWatchers();
      startPolling();
    }
  };

  const resolveTarget = async (): Promise<string | null> => {
    try {
      return await fsp.realpath(opts.path);
    } catch {
      return null;
    }
  };

  const readNow = async (isRetry: boolean): Promise<void> => {
    if (disposed) return;
    if (reading) {
      readAgain = true;
      return;
    }
    reading = true;
    try {
      const target = await resolveTarget();
      if (disposed) return;
      arm(target);
      const result = await readPalette(target ?? opts.path, opts.parse);
      if (disposed) return;
      if (result.palette) {
        lastPalette = result.palette;
        emit('ok');
      } else if (result.retriable && !isRetry) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void readNow(true), retryMs);
      } else {
        emit(result.state);
      }
    } finally {
      reading = false;
      if (readAgain && !disposed) {
        readAgain = false;
        schedule();
      }
    }
  };

  void readNow(false);

  return {
    stop() {
      disposed = true;
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
      closeWatchers();
    },
  };
}
