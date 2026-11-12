import { readFileSync, writeFileSync } from 'fs';
import { LIVE_BASE_URL, liveLinkUrl, newLiveCredentials, validateLiveState, type LiveState } from '../shared/live';
import { log as defaultLog } from './log';

interface Credentials { id: string; secret: string }
interface LinkFile extends Partial<Credentials> { pendingDelete?: Credentials[] }

const REQUEST_TIMEOUT_MS = 5000;
const POSITION_TOLERANCE_MS = 2000;
// The count is watched while someone reads it (the lyrics view asks every few seconds), then left alone.
const VIEWERS_WATCH_IDLE_MS = 15_000;
// The server holds a ?since= request up to 25 s: give it room before calling it lost.
const VIEWERS_WAIT_TIMEOUT_MS = 35_000;
const VIEWERS_RETRY_MS = 5000;

/** Where the state would be now, extrapolated from when it was read in the player. */
function caughtUp(state: LiveState, now: number): LiveState {
  if (!state.playing) return { ...state, at: now };
  const position = state.position + Math.max(0, now - state.at);
  const bounded = state.track.duration > 0 ? Math.min(position, state.track.duration) : position;
  return { ...state, position: Math.round(bounded), at: now };
}

/**
 * The live link: credentials kept in their own file (never in the config the Deezer page can read), and
 * the player state sent to breezr.babas.app. Sending never throws: a failure is logged and the next change
 * or heartbeat tries again.
 */
export function createLiveLink(opts: {
  file: string;
  fetch?: typeof fetch;
  now?: () => number;
  debounceMs?: number;
  heartbeatMs?: number;
  log?: (...m: string[]) => void;
}) {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const debounceMs = opts.debounceMs ?? 1000;
  const heartbeatMs = opts.heartbeatMs ?? 60_000;
  const log = opts.log ?? ((...m: string[]) => defaultLog('Live', ...m));

  let data: LinkFile = {};
  try {
    data = JSON.parse(readFileSync(opts.file, 'utf-8')) as LinkFile;
  } catch {
    // No link yet.
  }
  let latest: LiveState | null = null;
  let lastSent: LiveState | null = null;
  let lastSentAt = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let known: { id: string; count: number } | null = null;
  let lastAsked = 0;
  let watching = false;
  let stopped = false;
  // PUTs and DELETEs go out one at a time, in order: a send still in flight must never land after the
  // DELETE that turned the link off.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const credentials = (): Credentials | null => (data.id && data.secret ? { id: data.id, secret: data.secret } : null);
  const save = () => writeFileSync(opts.file, JSON.stringify(data), { mode: 0o600 });
  const endpoint = (id: string) => `${LIVE_BASE_URL}/api/live/${id}`;

  async function request(method: 'PUT' | 'DELETE', creds: Credentials, body?: LiveState): Promise<boolean> {
    try {
      const res = await doFetch(endpoint(creds.id), {
        method,
        headers: { Authorization: `Bearer ${creds.secret}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // A link already gone is what a DELETE wanted.
      if (res.ok || (method === 'DELETE' && res.status === 404)) return true;
      log(`${method} refused:`, String(res.status));
    } catch (e) {
      log(`${method} failed:`, String(e));
    }
    return false;
  }

  /** Same track, same play/pause, and the position where the last send predicts it: nothing new to say. */
  function unchanged(state: LiveState): boolean {
    if (!lastSent || lastSent.track.id !== state.track.id || lastSent.playing !== state.playing) return false;
    if (lastSent.track.title !== state.track.title) return false;
    if (Boolean(lastSent.showViewers) !== Boolean(state.showViewers)) return false;
    const expected = caughtUp(lastSent, state.at).position;
    return Math.abs(expected - state.position) <= POSITION_TOLERANCE_MS;
  }

  const send = (force: boolean) => enqueue(() => sendNow(force));

  async function sendNow(force: boolean) {
    // Read at run time: the link may have been turned off while this send waited in the queue.
    const creds = credentials();
    if (!creds || !latest) return;
    const state = caughtUp(latest, now());
    if (!force && unchanged(state)) return;
    if (await request('PUT', creds, state)) {
      lastSent = state;
      lastSentAt = now();
    }
  }

  const schedule = () => {
    clearTimeout(pending);
    pending = setTimeout(() => void send(false), debounceMs);
  };

  // Without news for 10 minutes the server shows "not listening": keep a playing link alive.
  const heartbeat = setInterval(() => {
    if (latest?.playing && credentials() && now() - lastSentAt >= heartbeatMs) void send(true);
  }, Math.min(heartbeatMs, 15_000));

  async function disable(): Promise<void> {
    const creds = credentials();
    clearTimeout(pending);
    lastSent = null;
    if (!creds) return;
    delete data.id;
    delete data.secret;
    save();
    const deleted = await enqueue(() => request('DELETE', creds));
    if (!deleted) {
      data.pendingDelete = [...(data.pendingDelete ?? []), creds];
      save();
    }
  }

  async function enable(): Promise<string> {
    let creds = credentials();
    if (!creds) {
      creds = newLiveCredentials();
      data = { ...data, ...creds };
      save();
    }
    if (latest) schedule();
    return liveLinkUrl(creds.id);
  }

  async function readViewers(creds: Credentials, since: number | null, timeoutMs: number): Promise<number | null> {
    try {
      const query = since === null ? '' : `?since=${since}`;
      const res = await doFetch(`${endpoint(creds.id)}/viewers${query}`, {
        headers: { Authorization: `Bearer ${creds.secret}` }, signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { viewers?: unknown };
      return typeof body.viewers === 'number' ? body.viewers : null;
    } catch {
      return null;
    }
  }

  /** One waiting request at a time, for as long as someone keeps reading the count. */
  async function watchViewers(creds: Credentials) {
    if (watching) return;
    watching = true;
    try {
      while (!stopped && now() - lastAsked <= VIEWERS_WATCH_IDLE_MS && credentials()?.id === creds.id && known?.id === creds.id) {
        const count = await readViewers(creds, known.count, VIEWERS_WAIT_TIMEOUT_MS);
        if (count === null) {
          await new Promise((r) => setTimeout(r, VIEWERS_RETRY_MS));
          continue;
        }
        if (known?.id === creds.id) known = { id: creds.id, count };
      }
    } finally {
      watching = false;
    }
  }

  return {
    url: () => {
      const creds = credentials();
      return creds ? liveLinkUrl(creds.id) : null;
    },
    enable,
    disable,
    async renew(): Promise<string> {
      await disable();
      return enable();
    },
    /** How many pages follow the link now (owner-only on the server); null when off or unreachable. */
    /**
     * How many pages follow the link. The first read asks the server; then one request waits on the server for
     * the count to change, so a new viewer shows within moments. It stops once nobody has asked for a while.
     */
    async viewers(): Promise<number | null> {
      const creds = credentials();
      if (!creds) return null;
      lastAsked = now();
      if (known?.id !== creds.id) {
        const count = await readViewers(creds, null, REQUEST_TIMEOUT_MS);
        if (count === null) return null;
        known = { id: creds.id, count };
      }
      void watchViewers(creds);
      return known.count;
    },
    /**
     * Breezr is quitting: the page must stop at once instead of playing on for the 10 minutes it takes to
     * notice the silence. Sends a paused state and waits for it at most `timeoutMs`, so a dead network never
     * holds the quit back.
     */
    async goOffline(timeoutMs = 1500): Promise<void> {
      clearTimeout(pending);
      if (!credentials() || !latest?.playing) return;
      latest = { ...caughtUp(latest, now()), playing: false, at: now() };
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([send(true), new Promise((r) => { timer = setTimeout(r, timeoutMs); })]);
      clearTimeout(timer);
    },
    publish(state: LiveState) {
      latest = state;
      if (credentials()) schedule();
    },
    async retryPendingDelete(): Promise<void> {
      const remaining: Credentials[] = [];
      for (const creds of data.pendingDelete ?? []) if (!(await request('DELETE', creds))) remaining.push(creds);
      if ((data.pendingDelete ?? []).length === 0) return;
      data.pendingDelete = remaining;
      save();
    },
    stop() {
      stopped = true;
      clearTimeout(pending);
      clearInterval(heartbeat);
    },
  };
}

/** At most `max` UTF-16 units, never cutting an emoji (surrogate pair) in half. */
function clip(text: string, max = 300): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** The live state from what updateActivity reads in Deezer's player; null when it would not validate. */
export function buildLiveState(result: {
  trackId: string; isrc?: string; trackName: string; artists: string; albumName: string; coverUrl: string;
  songTime: number; timeLeft: number; playing: boolean; isLivestreamRadio?: boolean;
}, now: number): LiveState | null {
  const duration = result.isLivestreamRadio ? 0 : Math.max(0, Math.round(result.songTime));
  const position = Math.max(0, Math.round(result.songTime - result.timeLeft));
  const track = {
    id: String(result.trackId), title: clip(result.trackName), artists: clip(result.artists), album: clip(result.albumName ?? ''),
    cover: result.coverUrl, duration,
    ...(typeof result.isrc === 'string' && /^[A-Z0-9]{12}$/.test(result.isrc) ? { isrc: result.isrc } : {}),
  };
  return validateLiveState({ track, playing: result.playing, position: duration > 0 ? Math.min(position, duration) : position, at: now });
}
