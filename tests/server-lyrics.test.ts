import { describe, expect, test } from 'bun:test';
import { createLyricsService, parseLrc } from '../server/src/lyrics';

const Q = { artist: 'Daft Punk', title: 'Get Lucky', album: 'RAM', durationSec: 248 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(handler: (url: URL) => Response | Promise<Response>) {
  const calls: { url: URL; headers: Headers }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: new Headers(init?.headers) });
    return handler(url);
  }) as typeof fetch;
  return { fn, calls };
}

describe('parseLrc', () => {
  test('timestamps, several per line, metadata tags ignored, sorted', () => {
    expect(parseLrc('[ar:Daft Punk]\n[01:02.00][01:30.10]Chorus\n[00:12.50]Hello')).toEqual([
      { t: 12500, text: 'Hello' }, { t: 62000, text: 'Chorus' }, { t: 90100, text: 'Chorus' },
    ]);
  });
});

describe('lyrics service', () => {
  test('synced lyrics from /api/get, then served from cache until the TTL', async () => {
    let now = 0;
    const { fn, calls } = fakeFetch(() => json({ syncedLyrics: '[00:01.00]Hi', plainLyrics: 'Hi', duration: 248 }));
    const service = createLyricsService({ fetch: fn, now: () => now, ttlMs: 1000 });
    expect(await service.get(Q)).toEqual({ kind: 'synced', lines: [{ t: 1000, text: 'Hi' }] });
    await service.get(Q);
    expect(calls.length).toBe(1);
    expect(calls[0].url.pathname).toBe('/api/get');
    expect(calls[0].headers.get('user-agent')).toContain('Breezr');
    now = 1001;
    await service.get(Q);
    expect(calls.length).toBe(2);
  });

  test('falls back to /api/search, keeping a result within 3 s of the duration', async () => {
    const near = fakeFetch((url) => (url.pathname === '/api/get' ? json({}, 404) : json([{ duration: 250, plainLyrics: 'La' }])));
    expect(await createLyricsService({ fetch: near.fn }).get(Q)).toEqual({ kind: 'plain', text: 'La' });
    const far = fakeFetch((url) => (url.pathname === '/api/get' ? json({}, 404) : json([{ duration: 258, plainLyrics: 'La' }])));
    expect(await createLyricsService({ fetch: far.fn }).get(Q)).toEqual({ kind: 'none' });
  });

  test('plain lyrics only', async () => {
    const { fn } = fakeFetch(() => json({ syncedLyrics: null, plainLyrics: 'Just words', duration: 248 }));
    expect(await createLyricsService({ fetch: fn }).get(Q)).toEqual({ kind: 'plain', text: 'Just words' });
  });

  test('a hanging LRCLIB gives none quickly, and is asked again next time', async () => {
    const { fn, calls } = fakeFetch((url) => new Promise(() => void url));
    const service = createLyricsService({ fetch: fn, timeoutMs: 50 });
    const started = Date.now();
    expect(await service.get(Q)).toEqual({ kind: 'none' });
    expect(Date.now() - started).toBeLessThan(500);
    await service.get(Q);
    expect(calls.filter((c) => c.url.pathname === '/api/get').length).toBe(2);
  });

  test('a network error gives none', async () => {
    const { fn } = fakeFetch(() => { throw new Error('offline'); });
    expect(await createLyricsService({ fetch: fn }).get(Q)).toEqual({ kind: 'none' });
  });
});

describe('lyrics service under load', () => {
  test('viewers asking for the same track at once share one LRCLIB request', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const { fn, calls } = fakeFetch(async () => { await gate; return json({ plainLyrics: 'La', duration: 248 }); });
    const service = createLyricsService({ fetch: fn });
    const both = Promise.all([service.get(Q), service.get(Q)]);
    release();
    expect(await both).toEqual([{ kind: 'plain', text: 'La' }, { kind: 'plain', text: 'La' }]);
    expect(calls.length).toBe(1);
  });

  test('a failure is reported as such, so it is not cached downstream', async () => {
    const { fn } = fakeFetch(() => { throw new Error('offline'); });
    expect(await createLyricsService({ fetch: fn }).lookup(Q)).toEqual({ result: { kind: 'none' }, ok: false });
    const fine = fakeFetch(() => json({ plainLyrics: 'La', duration: 248 }));
    expect(await createLyricsService({ fetch: fine.fn }).lookup(Q)).toEqual({ result: { kind: 'plain', text: 'La' }, ok: true });
  });
});
