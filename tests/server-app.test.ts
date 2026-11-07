import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApp } from '../server/src/app';
import { LiveStore } from '../server/src/store';
import type { LiveState } from '../src/shared/live';

const ID = 'k7Qm2xP9ab';
const SECRET = 's'.repeat(43);
const state = (title = 'Get Lucky'): LiveState => ({
  track: { id: '1', title, artists: 'Daft Punk', album: 'RAM', cover: 'https://e-cdns-images.dzcdn.net/a.jpg', duration: 248000 },
  playing: true, position: 0, at: 1,
});

let dir = '';
let server: Server;
let base = '';
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
  const lyrics = { get: async () => ({ kind: 'plain' as const, text: 'La la' }) };
  server = createServer(createApp({ store, lyrics, publicDir }));
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
      "default-src 'self'; img-src https://*.dzcdn.net data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('assets are served, nothing outside them', async () => {
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect((await fetch(`${base}/assets/../../etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base}/assets/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base}/assets/%E0%A4%A`)).status).toBe(404);
  });

  test('lyrics need a title and an artist', async () => {
    expect((await fetch(`${base}/api/lyrics?title=x`)).status).toBe(400);
    const ok = await fetch(`${base}/api/lyrics?title=x&artist=y&album=z&duration=200`);
    expect(await ok.json()).toEqual({ kind: 'plain', text: 'La la' });
  });
});
