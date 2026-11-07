import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { creationKey, createApp, createLiveServer, writeOrDrop } from '../server/src/app';
import { connect } from 'net';
import { LiveStore } from '../server/src/store';
import type { LiveState } from '../src/shared/live';
import type { VideoAnswer } from '../server/src/youtube';
import type { TrackQuery } from '../server/src/youtube-pick';

const ID = 'k7Qm2xP9ab';
const SECRET = 's'.repeat(43);
const state = (title = 'Get Lucky'): LiveState => ({
  track: { id: '1', title, artists: 'Daft Punk', album: 'RAM', cover: 'https://e-cdns-images.dzcdn.net/a.jpg', duration: 248000 },
  playing: true, position: 0, at: 1,
});

let dir = '';
let server: Server;
let base = '';
const lookups: { title: string; artist: string; album: string; durationSec: number }[] = [];
const videoLookups: TrackQuery[] = [];
const priorities: boolean[] = [];
// Track ids decide the fake answer: 1 found, 3 none, anything else unavailable.
const videos = {
  lookup: async (q: TrackQuery, mayPay?: () => boolean, priority?: boolean): Promise<VideoAnswer> => {
    videoLookups.push(q);
    priorities.push(priority === true);
    // Track ids from 100 on stand for tracks nobody looked up yet: they need a paid search.
    if (Number(q.trackId) >= 100) return mayPay?.() ? { status: 'found', videoId: `v${q.trackId}`, kind: 'clip' } : { status: 'unavailable' };
    if (q.trackId === '1') return { status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' };
    return q.trackId === '3' ? { status: 'none' } : { status: 'unavailable' };
  },
};
const noVideos = { lookup: async (): Promise<VideoAnswer> => ({ status: 'unavailable' }) };
const put = (id: string, body: unknown, secret: string | null = SECRET) => fetch(`${base}/api/live/${id}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'breezr-app-'));
  const publicDir = join(dir, 'public');
  mkdirSync(join(publicDir, 'assets'), { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>page</title>');
  writeFileSync(join(publicDir, 'assets', 'app.js'), 'console.log(1)');
  const store = new LiveStore({ file: join(dir, 'ids.json') });
  const lyrics = { lookup: async (q: (typeof lookups)[number]) => { lookups.push(q); return { result: { kind: 'plain' as const, text: 'La la' }, ok: true }; } };
  server = createServer(createApp({ store, lyrics, videos, publicDir }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('live API', () => {
  test('writing needs the secret; reading is public', async () => {
    expect((await put(ID, state(), null)).status).toBe(401);
    expect((await put(ID, state())).status).toBe(204);
    const res = await fetch(`${base}/api/live/${ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('live');
    expect(body.state.track.title).toBe('Get Lucky');
    expect(typeof body.serverNow).toBe('number');
    expect((await put(ID, state(), 'x'.repeat(43))).status).toBe(403);
  });

  test('bad bodies are refused', async () => {
    expect((await put('AAAAAAAAAA', 'x'.repeat(5000))).status).toBe(400);
    expect((await put('AAAAAAAAAA', '{not json')).status).toBe(400);
    const evil = { ...state(), track: { ...state().track, cover: 'https://evil.com/x.jpg' } };
    expect((await put('AAAAAAAAAA', evil)).status).toBe(400);
  });

  test('too many writes are slowed down', async () => {
    expect((await put('BBBBBBBBBB', state())).status).toBe(204);
    const codes = await Promise.all(Array.from({ length: 8 }, () => put('BBBBBBBBBB', state()).then((r) => r.status)));
    expect(codes).toContain(429);
  });

  test('malformed and unknown ids are a clean 404', async () => {
    expect((await fetch(`${base}/api/live/abc`)).status).toBe(404);
    const unknown = await fetch(`${base}/api/live/ZZZZZZZZZZ`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ status: 'unknown' });
  });

  test('the event stream sends the current state, then every change', async () => {
    const id = 'CCCCCCCCCC';
    await put(id, state('First'));
    const res = await fetch(`${base}/api/live/${id}/events`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const next = async () => {
      while (!buffer.includes('\n\n')) buffer += decoder.decode((await reader.read()).value);
      const [event, rest] = [buffer.slice(0, buffer.indexOf('\n\n')), buffer.slice(buffer.indexOf('\n\n') + 2)];
      buffer = rest;
      return JSON.parse(event.replace(/^data: /, ''));
    };
    expect((await next()).state.track.title).toBe('First');
    await put(id, state('Second'));
    expect((await next()).state.track.title).toBe('Second');
    await reader.cancel();
  });

  test('delete with the secret, then the link is gone', async () => {
    const id = 'DDDDDDDDDD';
    await put(id, state());
    const del = (secret: string) => fetch(`${base}/api/live/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${secret}` } });
    expect((await del('x'.repeat(43))).status).toBe(403);
    expect((await del(SECRET)).status).toBe(204);
    expect((await fetch(`${base}/api/live/${id}`)).status).toBe(404);
  });
});

describe('page and lyrics', () => {
  test('the page has strict security headers', async () => {
    const res = await fetch(`${base}/l/${ID}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>page</title>');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'self'; img-src 'self' https://*.dzcdn.net data:; style-src 'self'; script-src 'self' https://www.youtube.com; frame-src https://www.youtube-nocookie.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    // Always revalidated: it names the current script and stylesheet (?v=…), which can be cached for long.
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('assets are served, nothing outside them', async () => {
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    // Kept for a year only when the URL names its version; otherwise a few minutes.
    expect(js.headers.get('cache-control')).toBe('public, max-age=300');
    expect((await fetch(`${base}/assets/app.js?v=0123456789ab`)).headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await fetch(`${base}/assets/../../etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base}/assets/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base}/assets/%E0%A4%A`)).status).toBe(404);
  });

  test('lyrics only for the track a live link is playing', async () => {
    const id = 'EEEEEEEEEE';
    expect((await fetch(`${base}/api/live/${id}/lyrics?track=1`)).status).toBe(404);
    await put(id, state('Get Lucky'));
    const res = await fetch(`${base}/api/live/${id}/lyrics?track=1`);
    expect(await res.json()).toEqual({ kind: 'plain', text: 'La la' });
    expect(lookups.at(-1)).toEqual({ title: 'Get Lucky', artist: 'Daft Punk', album: 'RAM', durationSec: 248 });
  });

  test('lyrics are asked for one track: the URL names it, and a stale one is refused', async () => {
    const id = 'HHHHHHHHHH';
    await put(id, state('Get Lucky'));
    expect((await fetch(`${base}/api/live/${id}/lyrics?track=1`)).status).toBe(200);
    expect((await fetch(`${base}/api/live/${id}/lyrics?track=999`)).status).toBe(409);
    expect((await fetch(`${base}/api/live/${id}/lyrics`)).status).toBe(400);
  });

  test('video: found, none and unavailable answers for the current track', async () => {
    const id = 'VVVVVVVVVV';
    await put(id, state('Get Lucky'));
    const found = await fetch(`${base}/api/live/${id}/video?track=1`);
    expect(found.status).toBe(200);
    expect(found.headers.get('cache-control')).toBe('no-store');
    expect(await found.json()).toEqual({ videoId: '5NV6Rdv1a3I', kind: 'audio' });
    await put(id, { ...state('Other'), track: { ...state().track, id: '3', title: 'Other' } });
    expect(await (await fetch(`${base}/api/live/${id}/video?track=3`)).json()).toEqual({ none: true });
    await put(id, { ...state('Third'), track: { ...state().track, id: '4', title: 'Third' } });
    const down = await fetch(`${base}/api/live/${id}/video?track=4`);
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ unavailable: true });
  });

  test('video: only for the track being played, and the track must be named', async () => {
    const id = 'WWWWWWWWWW';
    expect((await fetch(`${base}/api/live/${id}/video?track=1`)).status).toBe(404);
    await put(id, state('Get Lucky'));
    expect((await fetch(`${base}/api/live/${id}/video?track=999`)).status).toBe(409);
    expect((await fetch(`${base}/api/live/${id}/video`)).status).toBe(400);
  });

  test('video: the search uses the main artist', async () => {
    const id = 'XXXXXXXXXX';
    await put(id, { ...state('Get Lucky'), track: { ...state().track, artists: 'Daft Punk, Pharrell Williams' } });
    await fetch(`${base}/api/live/${id}/video?track=1`);
    expect(videoLookups.at(-1)).toEqual({ trackId: '1', artist: 'Daft Punk', title: 'Get Lucky', durationSec: 248 });
    expect(priorities.at(-1)).toBe(false);
  });

  test('video: the full Deezer title reaches the picking rules, so a live track can match a live upload', async () => {
    const id = 'XXXXXXXXXX';
    await put(id, { ...state('505 (Live)'), track: { ...state().track, title: '505 (Live)' } });
    await fetch(`${base}/api/live/${id}/video?track=1`);
    expect(videoLookups.at(-1)?.title).toBe('505 (Live)');
  });

  test('duration 0 answers none without calling YouTube', async () => {
    const id = 'YYYYYYYYYY';
    await put(id, { ...state('Radio'), track: { ...state().track, id: '7', title: 'Radio', duration: 0 } });
    const before = videoLookups.length;
    expect(await (await fetch(`${base}/api/live/${id}/video?track=7`)).json()).toEqual({ none: true });
    expect(videoLookups.length).toBe(before);
  });

  test('there is no free-form lyrics lookup', async () => {
    expect((await fetch(`${base}/api/lyrics?title=x&artist=y`)).status).toBe(404);
  });
});

describe('abuse', () => {
  let dir2 = '';
  let server2: Server;
  let base2 = '';
  beforeAll(async () => {
    dir2 = mkdtempSync(join(tmpdir(), 'breezr-abuse-'));
    const store = new LiveStore({ file: join(dir2, 'ids.json') });
    server2 = createServer(createApp({ store, lyrics: { lookup: async () => ({ result: { kind: 'none' as const }, ok: false }) }, videos, publicDir: dir2 }));
    await new Promise<void>((r) => server2.listen(0, '127.0.0.1', r));
    base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server2.closeAllConnections();
    server2.close();
    rmSync(dir2, { recursive: true, force: true });
  });
  const put2 = (id: string, secret: string, title = 'x') => fetch(`${base2}/api/live/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(state(title)),
  });

  test('wrong keys do not use up the owner\'s writes, and are slowed down per IP', async () => {
    const id = 'FFFFFFFFFF';
    expect((await put2(id, SECRET)).status).toBe(204);
    const attacks = [];
    for (let i = 0; i < 15; i++) attacks.push((await put2(id, 'x'.repeat(43))).status);
    expect(attacks).toContain(403);
    expect(attacks).toContain(429);
    expect((await put2(id, SECRET, 'Still mine')).status).toBe(204);
  });

  test('paid searches are limited per link, cached answers are not', async () => {
    const id = 'PPPPPPPPPP';
    const codes = [];
    for (let i = 0; i < 6; i++) {
      // Owner writes are limited too (5, then 1/s): space them a little.
      if (i > 0) await new Promise((r) => setTimeout(r, 220));
      await fetch(`${base2}/api/live/${id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ ...state('x'), track: { ...state().track, id: String(100 + i) } }),
      });
      codes.push((await fetch(`${base2}/api/live/${id}/video?track=${100 + i}`)).status);
    }
    expect(codes).toEqual([200, 200, 200, 200, 200, 503]);
  });

  test('video requests are rate limited per IP', async () => {
    const id = 'ZZZZZZZZZZ';
    await put2(id, SECRET);
    const codes = [];
    for (let i = 0; i < 20; i++) codes.push((await fetch(`${base2}/api/live/${id}/video?track=1`)).status);
    expect(codes).toContain(200);
    expect(codes).toContain(429);
  });

  test('lyrics requests are rate limited per IP', async () => {
    const id = 'GGGGGGGGGG';
    await put2(id, SECRET);
    const codes = [];
    for (let i = 0; i < 30; i++) codes.push((await fetch(`${base2}/api/live/${id}/lyrics?track=1`)).status);
    expect(codes).toContain(200);
    expect(codes).toContain(429);
  });
});

describe('hardening', () => {
  let dir3 = '';
  let server3: Server;
  let base3 = '';
  let port3 = 0;
  beforeAll(async () => {
    dir3 = mkdtempSync(join(tmpdir(), 'breezr-hard-'));
    const store = new LiveStore({ file: join(dir3, 'ids.json') });
    server3 = createLiveServer({ store, lyrics: { lookup: async () => ({ result: { kind: 'none' as const }, ok: false }) }, videos: noVideos, publicDir: dir3 });
    await new Promise<void>((r) => server3.listen(0, '127.0.0.1', r));
    port3 = (server3.address() as AddressInfo).port;
    base3 = `http://127.0.0.1:${port3}`;
  });
  afterAll(() => {
    server3.closeAllConnections();
    server3.close();
    rmSync(dir3, { recursive: true, force: true });
  });

  test('a malformed request line gets a 400 and the server keeps running', async () => {
    const reply = await new Promise<string>((resolve) => {
      const socket = connect(port3, '127.0.0.1', () => socket.write('GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
      let data = '';
      socket.on('data', (d) => { data += d; });
      socket.on('close', () => resolve(data));
      socket.on('error', () => resolve(data));
    });
    expect(reply.startsWith('HTTP/1.1 400')).toBe(true);
    expect((await fetch(`${base3}/api/live/AAAAAAAAAA`)).status).toBe(404);
  });

  test('requests must arrive quickly', () => {
    expect(server3.requestTimeout).toBeLessThanOrEqual(10_000);
    expect(server3.headersTimeout).toBeLessThanOrEqual(10_000);
  });

  test('one IP cannot hold more than 20 live streams', async () => {
    const opened: Response[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${base3}/api/live/AAAAAAAAAA/events`);
      expect(res.status).toBe(200);
      opened.push(res);
    }
    expect((await fetch(`${base3}/api/live/AAAAAAAAAA/events`)).status).toBe(429);
    await Promise.all(opened.map((r) => r.body!.cancel()));
  });

  test('a failed lyrics lookup is not cached by browsers', async () => {
    const id = 'IIIIIIIIII';
    await fetch(`${base3}/api/live/${id}`, { method: 'PUT', headers: { authorization: `Bearer ${SECRET}` }, body: JSON.stringify(state()) });
    const res = await fetch(`${base3}/api/live/${id}/lyrics?track=1`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('a deleted link answers 410 to any further write', async () => {
    const id = 'JJJJJJJJJJ';
    const put3 = (secret: string) => fetch(`${base3}/api/live/${id}`, { method: 'PUT', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(state()) });
    expect((await put3(SECRET)).status).toBe(204);
    await fetch(`${base3}/api/live/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${SECRET}` } });
    expect((await put3('t'.repeat(43))).status).toBe(410);
    expect((await fetch(`${base3}/api/live/${id}`)).status).toBe(404);
  });
});

describe('helpers', () => {
  test('new links are counted per IPv6 /64 and per IPv4 address', () => {
    expect(creationKey('2001:db8:1:2:3:4:5:6')).toBe(creationKey('2001:db8:1:2:ffff::1'));
    expect(creationKey('2001:db8:1:3::1')).not.toBe(creationKey('2001:db8:1:2::1'));
    expect(creationKey('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(creationKey('1.2.3.4')).toBe('1.2.3.4');
  });

  test('a stream that stops reading is dropped instead of buffering forever', () => {
    let destroyed = false;
    const writes: string[] = [];
    const res = { writableLength: 70_000, write: (c: string) => writes.push(c), destroy: () => { destroyed = true; } };
    expect(writeOrDrop(res as never, 'x')).toBe(false);
    expect(destroyed).toBe(true);
    expect(writes).toEqual([]);
    const ok = { writableLength: 10, write: (c: string) => writes.push(c), destroy: () => undefined };
    expect(writeOrDrop(ok as never, 'y')).toBe(true);
  });
});

describe('viewer count', () => {
  let dir4 = '';
  let server4: Server;
  let base4 = '';
  beforeAll(async () => {
    dir4 = mkdtempSync(join(tmpdir(), 'breezr-viewers-'));
    const store = new LiveStore({ file: join(dir4, 'ids.json') });
    server4 = createLiveServer({ store, lyrics: { lookup: async () => ({ result: { kind: 'none' as const }, ok: true }) }, videos: noVideos, publicDir: dir4 });
    await new Promise<void>((r) => server4.listen(0, '127.0.0.1', r));
    base4 = `http://127.0.0.1:${(server4.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server4.closeAllConnections();
    server4.close();
    rmSync(dir4, { recursive: true, force: true });
  });
  const viewers = (id: string, secret: string | null) =>
    fetch(`${base4}/api/live/${id}/viewers`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });

  test('only the owner can read how many pages follow the link, and it counts open pages', async () => {
    const id = 'KKKKKKKKKK';
    await fetch(`${base4}/api/live/${id}`, { method: 'PUT', headers: { authorization: `Bearer ${SECRET}` }, body: JSON.stringify(state()) });
    expect(await (await viewers(id, SECRET)).json()).toEqual({ viewers: 0 });
    const a = await fetch(`${base4}/api/live/${id}/events`);
    const b = await fetch(`${base4}/api/live/${id}/events`);
    await new Promise((r) => setTimeout(r, 50));
    expect(await (await viewers(id, SECRET)).json()).toEqual({ viewers: 2 });
    await a.body!.cancel();
    await new Promise((r) => setTimeout(r, 100));
    expect(await (await viewers(id, SECRET)).json()).toEqual({ viewers: 1 });
    await b.body!.cancel();
    expect((await viewers(id, null)).status).toBe(401);
    expect((await viewers(id, 'x'.repeat(43))).status).toBe(403);
    expect((await viewers('ZZZZZZZZZZ', SECRET)).status).toBe(404);
  });
});

describe('viewer count on the page', () => {
  let dir5 = '';
  let server5: Server;
  let base5 = '';
  beforeAll(async () => {
    dir5 = mkdtempSync(join(tmpdir(), 'breezr-showviewers-'));
    const store = new LiveStore({ file: join(dir5, 'ids.json') });
    server5 = createLiveServer({ store, lyrics: { lookup: async () => ({ result: { kind: 'none' as const }, ok: true }) }, videos: noVideos, publicDir: dir5 });
    await new Promise<void>((r) => server5.listen(0, '127.0.0.1', r));
    base5 = `http://127.0.0.1:${(server5.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server5.closeAllConnections();
    server5.close();
    rmSync(dir5, { recursive: true, force: true });
  });
  const publish = (id: string, showViewers?: boolean) => fetch(`${base5}/api/live/${id}`, {
    method: 'PUT', headers: { authorization: `Bearer ${SECRET}` }, body: JSON.stringify({ ...state(), ...(showViewers === undefined ? {} : { showViewers }) }),
  });
  const reader = async (id: string) => {
    const res = await fetch(`${base5}/api/live/${id}/events`);
    const r = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return {
      next: async () => {
        while (!buffer.includes('\n\n')) buffer += decoder.decode((await r.read()).value);
        const event = buffer.slice(0, buffer.indexOf('\n\n'));
        buffer = buffer.slice(buffer.indexOf('\n\n') + 2);
        return JSON.parse(event.replace(/^data: /, ''));
      },
      close: () => r.cancel(),
    };
  };

  test('when the owner allows it, pages get the count and its changes', async () => {
    const id = 'XXXXXXXXXX';
    await publish(id, true);
    const first = await reader(id);
    expect((await first.next()).viewers).toBe(1);
    const second = await reader(id);
    expect((await second.next()).viewers).toBe(2);
    expect((await first.next()).viewers).toBe(2);
    await second.close();
    expect((await first.next()).viewers).toBe(1);
    await first.close();
  });

  test('otherwise the count is never sent to pages', async () => {
    const id = 'MMMMMMMMMM';
    await publish(id);
    const page = await reader(id);
    expect('viewers' in (await page.next())).toBe(false);
    await page.close();
    expect('viewers' in (await (await fetch(`${base5}/api/live/${id}`)).json())).toBe(false);
  });
});

describe('paid video searches', () => {
  let dir6 = '';
  let server6: Server;
  let base6 = '';
  const clock = { now: Date.now() };
  beforeAll(async () => {
    dir6 = mkdtempSync(join(tmpdir(), 'breezr-paid-'));
    const store = new LiveStore({ file: join(dir6, 'ids.json') });
    server6 = createServer(createApp({ store, lyrics: { lookup: async () => ({ result: { kind: 'none' as const }, ok: true }) }, videos, publicDir: dir6, now: () => clock.now, priorityLinks: new Set(['Owner00001']) }));
    await new Promise<void>((r) => server6.listen(0, '127.0.0.1', r));
    base6 = `http://127.0.0.1:${(server6.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server6.closeAllConnections();
    server6.close();
    rmSync(dir6, { recursive: true, force: true });
  });
  // Requests come through Caddy on the server: the viewer's address is in X-Forwarded-For.
  const playOn = (link: string, track: number) => fetch(`${base6}/api/live/${link}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}`, 'x-forwarded-for': `10.0.${track % 250}.1` },
    body: JSON.stringify({ ...state('x'), track: { ...state().track, id: String(track) } }),
  });
  const ask = (link: string, track: number, ip: string) => fetch(`${base6}/api/live/${link}/video?track=${track}`, { headers: { 'x-forwarded-for': ip } });

  test('a viewer out of paid searches cannot spend the link\'s', async () => {
    // Viewer 203.0.113.9 uses up its 20 paid searches on four other links (5 each).
    let track = 1000;
    for (const link of ['Pa00000001', 'Pa00000002', 'Pa00000003', 'Pa00000004']) {
      for (let i = 0; i < 5; i++) {
        clock.now += 2000;
        await playOn(link, ++track);
        await ask(link, track, '203.0.113.9');
      }
    }
    // Now it hammers a victim link: refused every time.
    const victim = 'Victim0001';
    const refused = [];
    for (let i = 0; i < 5; i++) {
      clock.now += 2000;
      await playOn(victim, ++track);
      refused.push((await ask(victim, track, '203.0.113.9')).status);
    }
    expect(refused).toEqual([503, 503, 503, 503, 503]);
    // The link's own budget is intact: another viewer still gets five new tracks.
    const fine = [];
    for (let i = 0; i < 5; i++) {
      clock.now += 2000;
      await playOn(victim, ++track);
      fine.push((await ask(victim, track, '198.51.100.7')).status);
    }
    expect(fine).toEqual([200, 200, 200, 200, 200]);
  });

  test('the owner\'s own links use the reserved budget and are not limited', async () => {
    const codes = [];
    let track = 5000;
    for (let i = 0; i < 8; i++) {
      clock.now += 2000;
      await playOn('Owner00001', ++track);
      codes.push((await ask('Owner00001', track, '203.0.113.9')).status);
    }
    expect(codes).toEqual(Array(8).fill(200));
    expect(priorities.at(-1)).toBe(true);
  });
});
