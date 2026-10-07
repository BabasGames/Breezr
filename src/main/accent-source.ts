import { systemPreferences } from 'electron';
import { paletteFingerprint, parseAccentColor, type ExternalPalette, type SourceUpdate } from '../shared/palette';
import { log } from './log';
import type { SourceHandle } from './theme-source';

function readRaw(): string {
  try {
    return systemPreferences.getAccentColor() ?? '';
  } catch (e) {
    log('Theme', 'Could not read the system accent colour:', String(e));
    return '';
  }
}

function toUpdate(raw: string, now: () => number): SourceUpdate {
  const palette = parseAccentColor(raw);
  // '' = no accent on this system (Windows without one, Linux without a portal providing it).
  return palette ? { palette, status: { state: 'ok', updatedAt: now() } } : { palette: null, status: { state: 'unavailable' } };
}

export function readAccentOnce(now: () => number = Date.now): SourceUpdate {
  return toUpdate(readRaw(), now);
}

/**
 * Follows the OS accent colour: 'accent-color-changed' on Windows and Linux; on macOS that event does not
 * exist, so the colour-preferences notification triggers a re-read. Repeated identical values (Linux sends
 * one soon after start-up) are ignored.
 */
export function watchAccentSource(onUpdate: (update: SourceUpdate) => void, initial: ExternalPalette | null = null): SourceHandle {
  let stopped = false;
  let lastFingerprint = paletteFingerprint(initial);
  let lastState: string | null = null;

  const handle = (raw: string) => {
    if (stopped) return;
    const update = toUpdate(raw, Date.now);
    const fingerprint = paletteFingerprint(update.palette);
    if (fingerprint === lastFingerprint && update.status.state === lastState) return;
    lastFingerprint = fingerprint;
    lastState = update.status.state;
    onUpdate(update);
  };

  const onChanged = (_event: unknown, newColor: string) => handle(typeof newColor === 'string' ? newColor : '');
  let subscription: number | null = null;
  if (process.platform === 'darwin') {
    subscription = systemPreferences.subscribeNotification('AppleColorPreferencesChangedNotification', () => handle(readRaw()));
  } else {
    systemPreferences.on('accent-color-changed', onChanged);
  }

  handle(readRaw());

  return {
    stop() {
      stopped = true;
      if (subscription !== null) systemPreferences.unsubscribeNotification(subscription);
      else systemPreferences.removeListener('accent-color-changed', onChanged);
    },
  };
}
