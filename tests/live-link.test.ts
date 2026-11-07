import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLiveLink } from '../src/main/live-link';
import type { LiveState } from '../src/shared/live';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = (patch: Partial<LiveState> = {}, title = 'Get Lucky'): LiveState => ({
  track: { id: '1', title, artists: 'Daft Punk', album: 'RAM', cover: 'https://e-cdns-images.dzcdn.net/a.jpg', duration: 248000 },
  playing: true, position: 10000, at: Date.now(), ...patch,
});

function fakeFetch(fail = false) {
  const calls: { method: string; url: string; auth: string | null; body: LiveState | null }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      method: init?.method ?? 'GET', url: String(input), auth: headers.get('authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (fail) throw new Error('offline');
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return { fn, calls };
}

describe('live link', () => {
  let dir = '';
  const links: { stop(): void }[] = [];
  const make = (fetchImpl: typeof fetch, opts: { heartbeatMs?: number } = {}) => {
    const link = createLiveLink({ file: join(dir, 'live-link.json'), fetch: fetchImpl, debounceMs: 20, heartbeatMs: opts.heartbeatMs ?? 60_000, log: () => undefined });
    links.push(link);
    return link;
  };
  const setup = () => { dir = mkdtempSync(join(tmpdir(), 'breezr-live-')); };
  afterEach(() => {
    links.splice(0).forEach((l) => l.stop());
    rmSync(dir, { recursive: true, force: true });
  });

  test('no link until enabled; enabling creates a private file and a stable URL', async () => {
    setup();
    const link = make(fakeFetch().fn);
    expect(link.url()).toBeNull();
    const url = await link.enable();
    expect(url).toMatch(/^https:\/\/breezr\.babas\.app\/l\/[0-9A-Za-z]{10}$/);
    expect(statSync(join(dir, 'live-link.json')).mode & 0o777).toBe(0o600);
    expect(await link.enable()).toBe(url);
    expect(make(fakeFetch().fn).url()).toBe(url);
  });

  test('nothing is sent while disabled', async () => {
    setup();
    const { fn, calls } = fakeFetch();
    make(fn).publish(state());
    await wait(60);
    expect(calls.length).toBe(0);
  });

  test('bursts are debounced into one authenticated PUT; an unchanged state is not resent', async () => {
    setup();
    const { fn, calls } = fakeFetch();
    const link = make(fn);
    await link.enable();
    link.publish(state({ position: 1000 }));
    link.publish(state({ position: 2000 }));
    await wait(60);
    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].auth).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
    expect(calls[0].url).toBe(`${link.url()!.replace('/l/', '/api/live/')}`);
    link.publish(state({ position: 2000 + 60 }));
    await wait(60);
    expect(calls.length).toBe(1);
    link.publish(state({ playing: false }));
    await wait(60);
    expect(calls.length).toBe(2);
  });

  test('the position sent is brought up to the moment of sending', async () => {
    setup();
    const { fn, calls } = fakeFetch();
    const link = make(fn);
    await link.enable();
    const before = Date.now();
    link.publish(state({ position: 10000, at: before - 5000 }));
    await wait(60);
    expect(calls[0].body!.position).toBeGreaterThanOrEqual(15000);
    expect(calls[0].body!.at).toBeGreaterThanOrEqual(before);
  });

  test('enabling sends the track already playing right away', async () => {
    setup();
    const { fn, calls } = fakeFetch();
    const link = make(fn);
    link.publish(state());
    await link.enable();
    await wait(60);
    expect(calls.filter((c) => c.method === 'PUT').length).toBe(1);
  });

  test('a heartbeat keeps a playing link alive', async () => {
    setup();
    const { fn, calls } = fakeFetch();
    const link = make(fn, { heartbeatMs: 80 });
    await link.enable();
    link.publish(state());
    await wait(250);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test('network errors never throw, and the next change is sent', async () => {
    setup();
    let failing = true;
    const calls: string[] = [];
    const fn = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init?.method ?? 'GET');
      if (failing) throw new Error('offline');
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const link = make(fn);
    await link.enable();
    link.publish(state());
    await wait(60);
    failing = false;
    link.publish(state({}, 'Next'));
    await wait(60);
    expect(calls).toEqual(['PUT', 'PUT']);
  });

  test('disabling deletes the link; if offline, the delete is retried later', async () => {
    setup();
    const ok = fakeFetch();
    const link = make(ok.fn);
    const url = (await link.enable()).split('/').pop();
    await link.disable();
    expect(ok.calls.at(-1)!.method).toBe('DELETE');
    expect(ok.calls.at(-1)!.url.endsWith(`/api/live/${url}`)).toBe(true);
    expect(link.url()).toBeNull();

    const offline = make(fakeFetch(true).fn);
    await offline.enable();
    await offline.disable();
    expect(JSON.parse(readFileSync(join(dir, 'live-link.json'), 'utf-8')).pendingDelete.length).toBe(1);
    const back = fakeFetch();
    await make(back.fn).retryPendingDelete();
    expect(back.calls.map((c) => c.method)).toEqual(['DELETE']);
    expect(JSON.parse(readFileSync(join(dir, 'live-link.json'), 'utf-8')).pendingDelete ?? []).toEqual([]);
  });

  test('a new link replaces the old one, which is deleted', async () => {
    setup();
    const { fn, calls } = fakeFetch();
    const link = make(fn);
    const first = await link.enable();
    const second = await link.renew();
    expect(second).not.toBe(first);
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith(first.split('/').pop()!))).toBe(true);
  });

  test('turning the link off waits for a send in progress, so the delete always lands last', async () => {
    setup();
    const events: string[] = [];
    const fn = (async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      events.push(`${method} start`);
      if (method === 'PUT') await wait(100);
      events.push(`${method} end`);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const link = make(fn);
    await link.enable();
    link.publish(state());
    await wait(40);
    await link.disable();
    expect(events).toEqual(['PUT start', 'PUT end', 'DELETE start', 'DELETE end']);
  });

  test('viewer count: read with the key, cached for a while, null when off or unreachable', async () => {
    setup();
    const calls: string[] = [];
    let fail = false;
    const fn = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input).split('/').pop()} ${new Headers(init?.headers).get('authorization') ? 'auth' : 'anon'}`);
      if (fail) throw new Error('offline');
      return new Response(JSON.stringify({ viewers: 3 }), { status: 200 });
    }) as typeof fetch;
    let now = 1000;
    const link = createLiveLink({ file: join(dir, 'live-link.json'), fetch: fn, now: () => now, log: () => undefined });
    links.push(link);
    expect(await link.viewers()).toBeNull();
    expect(calls).toEqual([]);
    await link.enable();
    expect(await link.viewers()).toBe(3);
    expect(await link.viewers()).toBe(3);
    expect(calls).toEqual(['GET viewers auth']);
    now += 20_001;
    fail = true;
    expect(await link.viewers()).toBeNull();
  });
});

