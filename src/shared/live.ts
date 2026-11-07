// Shared by the app (main process), the live server and the viewer page: no Node or DOM imports.

export const LIVE_BASE_URL = 'https://breezr.babas.app';
export const ID_PATTERN = /^[0-9A-Za-z]{10}$/;

/** What Breezr publishes about the track being played. Times in ms; duration 0 = unknown (live radio). */
export interface LiveTrack {
  id: string;
  isrc?: string;
  title: string;
  artists: string;
  album: string;
  cover: string;
  duration: number;
}

/** `position` was the playback position at `at` (Breezr's clock). */
export interface LiveState {
  track: LiveTrack;
  playing: boolean;
  position: number;
  at: number;
}

export type LyricsResult =
  | { kind: 'synced'; lines: { t: number; text: string }[] }
  | { kind: 'plain'; text: string }
  | { kind: 'none' };

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 10;
const SECRET_BYTES = 32;
const MAX_TEXT = 300;
const MAX_DURATION = 86_400_000;

type Random = (n: number) => Uint8Array;
const cryptoRandom: Random = (n) => crypto.getRandomValues(new Uint8Array(n));

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function newLiveCredentials(random: Random = cryptoRandom): { id: string; secret: string } {
  let id = '';
  while (id.length < ID_LENGTH) {
    for (const b of random(ID_LENGTH * 2)) {
      // 248 = 4 × 62: dropping higher bytes keeps every character equally likely.
      if (b < 248 && id.length < ID_LENGTH) id += BASE62[b % 62];
    }
  }
  return { id, secret: base64url(random(SECRET_BYTES)) };
}

export function liveLinkUrl(id: string): string {
  return `${LIVE_BASE_URL}/l/${id}`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: Obj, allowed: readonly string[]) => Object.keys(o).every((k) => allowed.includes(k));
const text = (v: unknown, allowEmpty = false) => typeof v === 'string' && v.length <= MAX_TEXT && (allowEmpty || v.trim() !== '');
const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Deezer's image CDN only: the page must never become a way to show arbitrary images. */
function isDeezerCover(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 500) return false;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && (url.hostname === 'dzcdn.net' || url.hostname.endsWith('.dzcdn.net'));
  } catch {
    return false;
  }
}

const TRACK_KEYS = ['id', 'isrc', 'title', 'artists', 'album', 'cover', 'duration'] as const;
const STATE_KEYS = ['track', 'playing', 'position', 'at'] as const;

/** The exact shape the server accepts; anything else (unknown fields included) is refused. */
export function validateLiveState(raw: unknown): LiveState | null {
  if (!isObj(raw) || !onlyKeys(raw, STATE_KEYS) || !isObj(raw.track) || !onlyKeys(raw.track, TRACK_KEYS)) return null;
  const t = raw.track;
  if (typeof t.id !== 'string' || !/^\d{1,20}$/.test(t.id)) return null;
  if (t.isrc !== undefined && (typeof t.isrc !== 'string' || !/^[A-Z0-9]{12}$/.test(t.isrc))) return null;
  if (!text(t.title) || !text(t.artists) || !text(t.album, true) || !isDeezerCover(t.cover)) return null;
  if (!int(t.duration, 0, MAX_DURATION)) return null;
  if (typeof raw.playing !== 'boolean') return null;
  if (!int(raw.position, 0, Math.max(t.duration as number, MAX_DURATION)) || !int(raw.at, 1, Number.MAX_SAFE_INTEGER)) return null;
  const track: LiveTrack = {
    id: t.id, title: t.title as string, artists: t.artists as string, album: t.album as string,
    cover: t.cover, duration: t.duration as number,
  };
  if (t.isrc !== undefined) track.isrc = t.isrc;
  return { track, playing: raw.playing, position: raw.position as number, at: raw.at as number };
}

/** Position now, measured on the server's clock (`receivedAt`: when the server got the state). */
export function positionAt(state: LiveState, serverNow: number, receivedAt: number): number {
  const elapsed = state.playing ? Math.max(0, serverNow - receivedAt) : 0;
  const position = state.position + elapsed;
  return state.track.duration > 0 ? Math.min(position, state.track.duration) : position;
}

/** Index of the line being sung (lines sorted by time), -1 before the first one. */
export function lineIndexAt(lines: readonly { t: number }[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
