import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { ID_PATTERN, validateLiveState, type LyricsResult } from '../../src/shared/live';
import { RateLimiter } from './rate-limit';
import type { LiveStore, Snapshot } from './store';
import type { LyricsQuery } from './lyrics';
import { mainArtist, type TrackQuery } from './youtube-pick';
import type { VideoAnswer } from './youtube';

const MAX_BODY = 4096;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PING_MS = 25_000;
const MAX_STREAMS = 10_000;
const MAX_STREAMS_PER_IP = 20;
const MAX_STREAM_BUFFER = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_LOOKUPS_IN_FLIGHT = 20;
const REPO_URL = 'https://github.com/BabasGames/Breezr';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    // YouTube: the IFrame API script and the privacy-enhanced player frame, loaded only once a viewer asks for music.
    'default-src \'self\'; img-src \'self\' https://*.dzcdn.net data:; style-src \'self\'; script-src \'self\' https://www.youtube.com; '
    + 'frame-src https://www.youtube-nocookie.com; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'none\'',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface LyricsSource { lookup(q: LyricsQuery): Promise<{ result: LyricsResult; ok: boolean }> }
export interface VideoSource { lookup(q: TrackQuery, mayPay?: () => boolean, priority?: boolean): Promise<VideoAnswer> }

class BodyError extends Error {}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...headers, ...(body === undefined ? {} : { 'Content-Type': MIME['.json'] }) });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

/** Reads at most MAX_BODY bytes; a larger body is refused without buffering the rest. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new BodyError('too large'));
        // Stop reading: the 400 goes out with Connection: close and the socket ends with it.
        req.removeAllListeners('data');
        req.pause();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/** Caddy runs on the same machine: trust its X-Forwarded-For, and only its. */
function clientIp(req: IncomingMessage): string {
  const peer = req.socket.remoteAddress ?? '';
  const fromProxy = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const forwarded = req.headers['x-forwarded-for'];
  if (fromProxy && typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return peer;
}

/**
 * Key for "new links per address": an IPv6 host can use its whole /64 (billions of addresses), so count the
 * /64; IPv4 (and IPv4-mapped IPv6) per address.
 */
export function creationKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1];
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** A viewer that stops reading must not make the server buffer for it forever: drop it instead. */
export function writeOrDrop(res: Pick<ServerResponse, 'writableLength' | 'write' | 'destroy'>, chunk: string): boolean {
  if (res.writableLength > MAX_STREAM_BUFFER) {
    res.destroy();
    return false;
  }
  res.write(chunk);
  return true;
}

function bearer(req: IncomingMessage): string | null {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
  return match && SECRET_PATTERN.test(match[1]) ? match[1] : null;
}

export function createApp(opts: {
  store: LiveStore; lyrics: LyricsSource; videos: VideoSource; publicDir: string; now?: () => number;
  /** The server owner's own links: they spend the reserved quota and skip the paid-search limits. */
  priorityLinks?: ReadonlySet<string>;
}): RequestListener {
  const { store, lyrics, videos, publicDir } = opts;
  const now = opts.now ?? Date.now;
  // Writes are charged to the link only once its owner is proven: a stranger who knows the (public) id cannot
  // use up the owner's budget. Wrong keys are charged to the caller's IP instead.
  const writes = new RateLimiter(5, 1, now);
  const wrongKeys = new RateLimiter(10, 10 / 60, now);
  const creations = new RateLimiter(10, 10 / 3600, now);
  const lyricsLookups = new RateLimiter(10, 0.5, now);
  const videoLookups = new RateLimiter(10, 0.5, now);
  // A search for a track nobody looked up yet costs 100 to 300 of the day's 9 500 YouTube units: per link,
  // about one new track per song length; per address, 20 an hour. Known tracks are not counted.
  const paidPerLink = new RateLimiter(5, 1 / 90, now);
  const paidPerIp = new RateLimiter(20, 20 / 3600, now);
  let streams = 0;
  const streamsByIp = new Map<string, number>();
  // Open viewer pages per link: only a number, nothing about who they are.
  const streamsById = new Map<string, number>();
  // Each open page's writer, so a page arriving or leaving can update the others' count.
  const writersById = new Map<string, Set<(snap: Snapshot) => void>>();
  const broadcastCount = (id: string) => {
    const snap = store.get(id);
    if (snap.status !== 'live' || !snap.state.showViewers) return;
    for (const write of writersById.get(id) ?? []) write(snap);
  };
  let lookupsInFlight = 0;

  /** 'ok' when the caller may write `id`, otherwise the response already sent. */
  function authorize(req: IncomingMessage, res: ServerResponse, id: string, secret: string): boolean {
    const ownership = store.check(id, secret);
    if (ownership === 'gone') {
      send(res, 410, { error: 'link deleted' });
      return false;
    }
    if (ownership === 'forbidden') {
      if (!wrongKeys.take(clientIp(req))) send(res, 429, { error: 'slow down' });
      else send(res, 403, { error: 'wrong key' });
      return false;
    }
    if (!writes.take(id) || (ownership === 'unclaimed' && !creations.take(creationKey(clientIp(req))))) {
      send(res, 429, { error: 'slow down' });
      return false;
    }
    return true;
  }

  // The count goes to pages only when the owner asked for it (state.showViewers).
  const snapshotBody = (snap: Snapshot, id?: string) =>
    snap.status === 'live'
      ? { ...snap, serverNow: now(), ...(snap.state.showViewers && id ? { viewers: streamsById.get(id) ?? 0 } : {}) }
      : snap.status === 'idle' ? { status: 'idle', serverNow: now() }
        : { status: 'unknown' };

  /**
   * The page itself is always revalidated (it names the current script and stylesheet with ?v=<hash>);
   * a file asked for with its version can be kept for a year, anything else a few minutes.
   */
  async function serveFile(res: ServerResponse, relative: string, versioned = false) {
    const root = join(publicDir, sep);
    const path = normalize(join(publicDir, relative));
    if (!path.startsWith(root) || !MIME[extname(path)]) return send(res, 404, { error: 'not found' });
    try {
      const data = await readFile(path);
      const cache = relative === 'index.html' ? 'no-cache' : versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[extname(path)], 'Cache-Control': cache });
      res.end(data);
    } catch {
      send(res, 404, { error: 'not found' });
    }
  }

  async function putLive(req: IncomingMessage, res: ServerResponse, id: string) {
    const secret = bearer(req);
    if (!secret) return send(res, 401, { error: 'missing key' });
    let raw: unknown;
    try {
      raw = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'invalid body' }, { Connection: 'close' });
    }
    const state = validateLiveState(raw);
    if (!state) return send(res, 400, { error: 'invalid state' });
    if (!authorize(req, res, id, secret)) return;
    const result = await store.put(id, secret, state);
    if (result === 'forbidden') return send(res, 403, { error: 'wrong key' });
    if (result === 'gone') return send(res, 410, { error: 'link deleted' });
    if (result === 'full') return send(res, 507, { error: 'full' });
    send(res, 204);
  }

  async function deleteLive(req: IncomingMessage, res: ServerResponse, id: string) {
    const secret = bearer(req);
    if (!secret) return send(res, 401, { error: 'missing key' });
    const ownership = store.check(id, secret);
    if (ownership === 'unclaimed' || ownership === 'gone') return send(res, 404, { status: 'unknown' });
    if (!authorize(req, res, id, secret)) return;
    const result = await store.remove(id, secret);
    if (result === 'forbidden') return send(res, 403, { error: 'wrong key' });
    if (result === 'missing') return send(res, 404, { status: 'unknown' });
    send(res, 204);
  }

  function stream(req: IncomingMessage, res: ServerResponse, id: string) {
    const ip = clientIp(req);
    const mine = streamsByIp.get(ip) ?? 0;
    if (mine >= MAX_STREAMS_PER_IP) return send(res, 429, { error: 'too many streams' });
    if (streams >= MAX_STREAMS) return send(res, 503, { error: 'busy' });
    streams++;
    streamsByIp.set(ip, mine + 1);
    streamsById.set(id, (streamsById.get(id) ?? 0) + 1);
    res.writeHead(200, {
      ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
    });
    const write = (snap: Snapshot) => writeOrDrop(res, `data: ${JSON.stringify(snapshotBody(snap, id))}\n\n`);
    let writers = writersById.get(id);
    if (!writers) writersById.set(id, (writers = new Set()));
    writers.add(write);
    write(store.get(id));
    broadcastOthers(id, write);
    const off = store.subscribe(id, write);
    const ping = setInterval(() => writeOrDrop(res, ': ping\n\n'), PING_MS);
    res.on('close', () => {
      streams--;
      const left = (streamsByIp.get(ip) ?? 1) - 1;
      if (left > 0) streamsByIp.set(ip, left);
      else streamsByIp.delete(ip);
      const watching = (streamsById.get(id) ?? 1) - 1;
      if (watching > 0) streamsById.set(id, watching);
      else streamsById.delete(id);
      writers.delete(write);
      if (writers.size === 0) writersById.delete(id);
      else broadcastCount(id);
      clearInterval(ping);
      off();
    });
  }

  /** A page arrived: the pages already open learn the new count (the newcomer got it with its first message). */
  function broadcastOthers(id: string, except: (snap: Snapshot) => void) {
    const snap = store.get(id);
    if (snap.status !== 'live' || !snap.state.showViewers) return;
    for (const write of writersById.get(id) ?? []) if (write !== except) write(snap);
  }

  /** How many pages follow the link right now: for its owner only (the key proves it). */
  function viewersRoute(req: IncomingMessage, res: ServerResponse, id: string) {
    const secret = bearer(req);
    if (!secret) return send(res, 401, { error: 'missing key' });
    const ownership = store.check(id, secret);
    if (ownership === 'unclaimed' || ownership === 'gone') return send(res, 404, { status: 'unknown' });
    if (ownership === 'forbidden') {
      if (!wrongKeys.take(clientIp(req))) return send(res, 429, { error: 'slow down' });
      return send(res, 403, { error: 'wrong key' });
    }
    send(res, 200, { viewers: streamsById.get(id) ?? 0 });
  }

  /**
   * Lyrics of the track a live link is playing, and only that: the server never relays free-form lookups to
   * LRCLIB. Throttled per IP and capped in flight.
   */
  async function lyricsRoute(req: IncomingMessage, res: ServerResponse, id: string, url: URL) {
    // The track id is part of the URL so a cached answer never belongs to another track.
    const wanted = url.searchParams.get('track');
    if (!wanted) return send(res, 400, { error: 'track needed' });
    const snap = store.get(id);
    if (snap.status !== 'live') return send(res, 404, snapshotBody(snap));
    if (snap.state.track.id !== wanted) return send(res, 409, { error: 'not the current track' });
    if (!lyricsLookups.take(clientIp(req))) return send(res, 429, { error: 'slow down' });
    if (lookupsInFlight >= MAX_LOOKUPS_IN_FLIGHT) return send(res, 503, { error: 'busy' });
    const { track } = snap.state;
    lookupsInFlight++;
    try {
      // LRCLIB knows songs by their main artist: "Daft Punk, Pharrell Williams" → "Daft Punk".
      const { result, ok } = await lyrics.lookup({
        title: track.title, artist: track.artists.split(', ')[0], album: track.album, durationSec: Math.round(track.duration / 1000),
      });
      // A failed lookup must not stick in browsers for an hour: the next viewer should try again.
      send(res, 200, result, { 'Cache-Control': ok ? 'public, max-age=3600' : 'no-store' });
    } finally {
      lookupsInFlight--;
    }
  }

  /**
   * The YouTube video of the track a live link is playing, and only that one: asked by a page only once its
   * viewer chose to listen. 503 when there is no key or no quota left today.
   */
  async function videoRoute(req: IncomingMessage, res: ServerResponse, id: string, url: URL) {
    const wanted = url.searchParams.get('track');
    if (!wanted) return send(res, 400, { error: 'track needed' });
    const snap = store.get(id);
    if (snap.status !== 'live') return send(res, 404, snapshotBody(snap));
    if (snap.state.track.id !== wanted) return send(res, 409, { error: 'not the current track' });
    const { track } = snap.state;
    // Live radio has no fixed recording to find.
    if (track.duration === 0) return send(res, 200, { none: true });
    if (!videoLookups.take(clientIp(req))) return send(res, 429, { error: 'slow down' });
    if (lookupsInFlight >= MAX_LOOKUPS_IN_FLIGHT) return send(res, 503, { unavailable: true });
    lookupsInFlight++;
    try {
      const ip = creationKey(clientIp(req));
      const priority = opts.priorityLinks?.has(id) === true;
      // The full title: the picking rules tell "505 (Live)" from "505" with it; the search itself strips it.
      // A stranger's requester budget is taken before the link's: one that is spent must not use up the link's.
      const mayPay = priority ? () => true : () => paidPerIp.take(ip) && paidPerLink.take(id);
      const answer = await videos.lookup({
        trackId: track.id, artist: mainArtist(track.artists), title: track.title, durationSec: Math.round(track.duration / 1000),
      }, mayPay, priority);
      if (answer.status === 'found') return send(res, 200, { videoId: answer.videoId, kind: answer.kind });
      if (answer.status === 'none') return send(res, 200, { none: true });
      send(res, 503, { unavailable: true });
    } finally {
      lookupsInFlight--;
    }
  }

  return (req, res) => {
    const method = req.method ?? 'GET';
    const handle = async () => {
      // Inside the try: a malformed request target (e.g. "//[") must answer 400, not kill the process.
      let url: URL;
      try {
        url = new URL(req.url ?? '/', 'http://localhost');
      } catch {
        return send(res, 400, { error: 'bad request' });
      }
      const path = url.pathname;
      const live = /^\/api\/live\/([^/]+)(\/events|\/lyrics|\/viewers|\/video)?$/.exec(path);
      if (live) {
        const [, id, sub] = live;
        if (!ID_PATTERN.test(id)) return send(res, 404, { status: 'unknown' });
        if (sub && method !== 'GET') return send(res, 405, { error: 'method' });
        if (sub === '/events') return stream(req, res, id);
        if (sub === '/lyrics') return lyricsRoute(req, res, id, url);
        if (sub === '/viewers') return viewersRoute(req, res, id);
        if (sub === '/video') return videoRoute(req, res, id, url);
        if (method === 'PUT') return putLive(req, res, id);
        if (method === 'DELETE') return deleteLive(req, res, id);
        if (method !== 'GET') return send(res, 405, { error: 'method' });
        const snap = store.get(id);
        return send(res, snap.status === 'unknown' ? 404 : 200, snapshotBody(snap, id));
      }
      if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { error: 'method' });
      if (/^\/l\/[^/]+$/.test(path)) return serveFile(res, 'index.html');
      if (path.startsWith('/assets/')) {
        let relative: string;
        try {
          relative = decodeURIComponent(path.slice(1));
        } catch {
          return send(res, 404, { error: 'not found' });
        }
        return serveFile(res, relative, url.searchParams.has('v'));
      }
      if (path === '/') return send(res, 302, undefined, { Location: REPO_URL });
      send(res, 404, { error: 'not found' });
    };
    handle().catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'server error' });
      else res.end();
    });
  };
}

/** The HTTP server itself, with short timeouts for receiving requests (streams are responses, not affected). */
export function createLiveServer(opts: Parameters<typeof createApp>[0]): Server {
  const server = createServer(createApp(opts));
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = REQUEST_TIMEOUT_MS;
  return server;
}
