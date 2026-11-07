// The viewer's music choice and the sync rules, kept free of the DOM and of YouTube so they can be tested.

/** `choice`: the two buttons; `lyrics`: lyrics only, cover shown; `music`: YouTube plays, lyrics follow it. */
export type Mode = 'choice' | 'lyrics' | 'music';
export type ModeEvent = 'listen' | 'lyricsOnly' | 'toggleVideo' | 'unavailable';

const SEEK_THRESHOLD_MS = 1500;

export function nextMode(mode: Mode, event: ModeEvent): Mode {
  if (mode === 'choice' && event === 'listen') return 'music';
  if (mode === 'choice' && event === 'lyricsOnly') return 'lyrics';
  if (event === 'toggleVideo' && mode !== 'choice') return mode === 'music' ? 'lyrics' : 'music';
  // 'unavailable' keeps music on: the next track looks for its own video.
  return mode;
}

/** The video is too far from the owner's position: jump to it. */
export function shouldSeek(videoMs: number, expectedMs: number, thresholdMs = SEEK_THRESHOLD_MS): boolean {
  return Math.abs(videoMs - expectedMs) > thresholdMs;
}

/** While music plays, lyrics follow what the viewer hears (the video), not the position Breezr published. */
export function lyricsTime(mode: Mode, videoMs: number | null, publishedMs: number): number {
  return mode === 'music' && videoMs !== null ? videoMs : publishedMs;
}
