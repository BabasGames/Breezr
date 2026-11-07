import { readFile } from 'node:fs/promises';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { ID_PATTERN, validateLiveState, type LyricsResult } from '../../src/shared/live';
import { RateLimiter } from './rate-limit';
import type { LiveStore, Snapshot } from './store';
import type { LyricsQuery } from './lyrics';

const MAX_BODY = 4096;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PING_MS = 25_000;
const MAX_STREAMS = 10_000;
const REPO_URL = 'https://github.com/BabasGames/Breezr';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    'default-src \'self\'; img-src https://*.dzcdn.net data:; style-src \'self\'; script-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'none\'',
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

export interface LyricsSource { get(q: LyricsQuery): Promise<LyricsResult> }

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
        req.removeAllListeners('data');
        req.resume();
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

function bearer(req: IncomingMessage): string | null {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
  return match && SECRET_PATTERN.test(match[1]) ? match[1] : null;
}

export function createApp(opts: { store: LiveStore; lyrics: LyricsSource; publicDir: string; now?: () => number }): RequestListener {
  const { store, lyrics, publicDir } = opts;
  const now = opts.now ?? Date.now;
  const writes = new RateLimiter(5, 1, now);
  const creations = new RateLimiter(10, 10 / 3600, now);
  let streams = 0;

  const snapshotBody = (snap: Snapshot) =>
    snap.status === 'live' ? { ...snap, serverNow: now() }
      : snap.status === 'idle' ? { status: 'idle', serverNow: now() }
        : { status: 'unknown' };

  async function serveFile(res: ServerResponse, relative: string) {
    const root = join(publicDir, sep);
    const path = normalize(join(publicDir, relative));
    if (!path.startsWith(root) || !MIME[extname(path)]) return send(res, 404, { error: 'not found' });
    try {
      const data = await readFile(path);
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[extname(path)], 'Cache-Control': 'public, max-age=300' });
      res.end(data);
    } catch {
      send(res, 404, { error: 'not found' });
    }
  }

  async function putLive(req: IncomingMessage, res: ServerResponse, id: string) {
    const secret = bearer(req);
    if (!secret) return send(res, 401, { error: 'missing key' });
    if (!writes.take(id)) return send(res, 429, { error: 'slow down' });
    let raw: unknown;
    try {
      raw = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'invalid body' });
    }
    const state = validateLiveState(raw);
    if (!state) return send(res, 400, { error: 'invalid state' });
    if (store.get(id).status === 'unknown' && !creations.take(clientIp(req))) return send(res, 429, { error: 'slow down' });
    const result = await store.put(id, secret, state);
    if (result === 'forbidden') return send(res, 403, { error: 'wrong key' });
    if (result === 'full') return send(res, 507, { error: 'full' });
    send(res, 204);
  }

  async function deleteLive(req: IncomingMessage, res: ServerResponse, id: string) {
    const secret = bearer(req);
    if (!secret) return send(res, 401, { error: 'missing key' });
    if (!writes.take(id)) return send(res, 429, { error: 'slow down' });
    const result = await store.remove(id, secret);
    if (result === 'forbidden') return send(res, 403, { error: 'wrong key' });
    if (result === 'missing') return send(res, 404, { status: 'unknown' });
    send(res, 204);
  }

  function stream(req: IncomingMessage, res: ServerResponse, id: string) {
    if (streams >= MAX_STREAMS) return send(res, 503, { error: 'busy' });
    streams++;
    res.writeHead(200, {
      ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
    });
    const write = (snap: Snapshot) => res.write(`data: ${JSON.stringify(snapshotBody(snap))}\n\n`);
    write(store.get(id));
    const off = store.subscribe(id, write);
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    req.on('close', () => {
      streams--;
      clearInterval(ping);
      off();
    });
  }

  async function lyricsRoute(url: URL, res: ServerResponse) {
    const p = url.searchParams;
    const title = p.get('title')?.trim() ?? '';
    const artist = p.get('artist')?.trim() ?? '';
    if (!title || !artist || title.length > 300 || artist.length > 300) return send(res, 400, { error: 'title and artist needed' });
    const durationSec = Math.max(0, Math.round(Number(p.get('duration')) || 0));
    const result = await lyrics.get({ title, artist, album: (p.get('album') ?? '').slice(0, 300), durationSec });
    send(res, 200, result, { 'Cache-Control': 'public, max-age=3600' });
  }

  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const handle = async () => {
      const live = /^\/api\/live\/([^/]+)(\/events)?$/.exec(path);
      if (live) {
        const [, id, events] = live;
        if (!ID_PATTERN.test(id)) return send(res, 404, { status: 'unknown' });
        if (events) return method === 'GET' ? stream(req, res, id) : send(res, 405, { error: 'method' });
        if (method === 'PUT') return putLive(req, res, id);
        if (method === 'DELETE') return deleteLive(req, res, id);
        if (method !== 'GET') return send(res, 405, { error: 'method' });
        const snap = store.get(id);
        return send(res, snap.status === 'unknown' ? 404 : 200, snapshotBody(snap));
      }
      if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { error: 'method' });
      if (path === '/api/lyrics') return lyricsRoute(url, res);
      if (/^\/l\/[^/]+$/.test(path)) return serveFile(res, 'index.html');
      if (path.startsWith('/assets/')) {
        let relative: string;
        try {
          relative = decodeURIComponent(path.slice(1));
        } catch {
          return send(res, 404, { error: 'not found' });
        }
        return serveFile(res, relative);
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
