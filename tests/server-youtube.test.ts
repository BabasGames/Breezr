import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createVideoService } from '../server/src/youtube';
import type { TrackQuery, YtVideo } from '../server/src/youtube-pick';
import search505 from './fixtures/youtube/505-search.json';
import topic505 from './fixtures/youtube/505-topic.json';
import searchDollar from './fixtures/youtube/dollar-search.json';
import searchLucky from './fixtures/youtube/lucky-search.json';

const KEY = 'AIzaFAKEKEY-not-a-real-one-0123456789ab';
const DAY = 86_400_000;
// 2026-11-07 12:00 UTC (04:00 in California).
const T0 = Date.UTC(2026, 10, 7, 12);

const q505: TrackQuery = { trackId: '4315389', artist: 'Arctic Monkeys', title: '505', durationSec: 253 };
const qDoIWanna: TrackQuery = { trackId: '1', artist: 'Arctic Monkeys', title: 'Do I Wanna Know?', durationSec: 272 };
const qLucky: TrackQuery = { trackId: '66609426', artist: 'Daft Punk', title: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)', durationSec: 248 };

const all = [...search505, ...topic505, ...searchDollar, ...searchLucky] as YtVideo[];
const iso = (sec: number) => `PT${Math.floor(sec / 60)}M${sec % 60}S`;
const asItem = (v: YtVideo) => ({
  id: v.id, contentDetails: { duration: iso(v.durationSec) }, status: { embeddable: v.embeddable },
  snippet: { channelTitle: v.channelTitle, title: v.title, description: v.description },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A fake YouTube Data API answering from the real fixtures; records every call. */
function fakeYouTube(overrides: { videos?: (ids: string[]) => YtVideo[]; fail?: Response } = {}) {
  const calls: string[] = [];
  const fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname.split('/').pop()}:${url.searchParams.get('type') ?? ''}:${url.searchParams.get('q') ?? url.searchParams.get('id')}`);
    if (overrides.fail) return overrides.fail.clone();
    if (url.pathname.endsWith('/videos')) {
      const ids = (url.searchParams.get('id') ?? '').split(',');
      const found = overrides.videos ? overrides.videos(ids) : all.filter((v) => ids.includes(v.id));
      return json({ items: found.map(asItem) });
    }
    const q = url.searchParams.get('q') ?? '';
    if (url.searchParams.get('type') === 'channel') {
      return json({ items: [{ id: { channelId: 'UC8Yu1_yfN5qPh601Y4btsYw' }, snippet: { title: q.replace(/ - Topic$/, '') + ' - Topic' } }] });
    }
    const source = url.searchParams.get('channelId') ? topic505 : q.includes('505') ? search505 : q.includes('Lucky') ? searchLucky : [];
    return json({ items: source.map((v) => ({ id: { videoId: v.id } })) });
  }) as typeof fetch;
  return { fetch, calls };
}

let dir = '';
let file = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'breezr-yt-'));
  file = join(dir, 'youtube.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function service(yt: ReturnType<typeof fakeYouTube>, clock: { now: number }, extra: Partial<Parameters<typeof createVideoService>[0]> = {}) {
  return createVideoService({ fetch: yt.fetch, key: KEY, file, now: () => clock.now, ...extra });
}

describe('video lookup', () => {
  test('key null → unavailable, no fetch', async () => {
    const yt = fakeYouTube();
    const s = createVideoService({ fetch: yt.fetch, key: null, file });
    expect(await s.lookup(qLucky)).toEqual({ status: 'unavailable' });
    expect(yt.calls).toEqual([]);
  });

  test('official found in first search', async () => {
    const yt = fakeYouTube();
    const s = service(yt, { now: T0 });
    expect(await s.lookup(qLucky)).toEqual({ status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' });
    expect(yt.calls.length).toBe(2);
    expect(yt.calls[0]).toBe('search:video:Daft Punk Get Lucky');
    expect(s.unitsToday()).toBe(101);
  });

  test('falls back to Topic channel; the channel is looked up once per artist', async () => {
    const yt = fakeYouTube();
    const s = service(yt, { now: T0 });
    expect(await s.lookup(q505)).toEqual({ status: 'found', videoId: 'qU9mHegkTc4', kind: 'audio' });
    expect(s.unitsToday()).toBe(302);
    expect(yt.calls.filter((c) => c.startsWith('search:channel')).length).toBe(1);
    expect(await s.lookup(qDoIWanna)).toEqual({ status: 'found', videoId: 'pqrUQrAcfo4', kind: 'audio' });
    expect(yt.calls.filter((c) => c.startsWith('search:channel')).length).toBe(1);
    expect(s.unitsToday()).toBe(302 + 201);
  });

  test('cached track costs nothing', async () => {
    const yt = fakeYouTube();
    const s = service(yt, { now: T0 });
    await s.lookup(qLucky);
    const before = yt.calls.length;
    expect(await s.lookup(qLucky)).toEqual({ status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' });
    expect(yt.calls.length).toBe(before);
  });

  test('30-day refresh: one videos.list on the known id, a new search if it is gone', async () => {
    const clock = { now: T0 };
    let alive = true;
    const yt = fakeYouTube({ videos: (ids) => all.filter((v) => ids.includes(v.id) && (alive || v.id !== '5NV6Rdv1a3I')) });
    const s = service(yt, clock);
    await s.lookup(qLucky);
    clock.now += 31 * DAY;
    const before = yt.calls.length;
    expect(await s.lookup(qLucky)).toEqual({ status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' });
    expect(yt.calls.slice(before)).toEqual(['videos::5NV6Rdv1a3I']);
    clock.now += 31 * DAY;
    alive = false;
    const again = yt.calls.length;
    expect(await s.lookup(qLucky)).toEqual({ status: 'none' });
    expect(yt.calls.slice(again)[0]).toBe('videos::5NV6Rdv1a3I');
    expect(yt.calls.slice(again).some((c) => c.startsWith('search:video'))).toBe(true);
  });

  test('none retried after 7 days', async () => {
    const clock = { now: T0 };
    const yt = fakeYouTube();
    const s = service(yt, clock);
    const nothing: TrackQuery = { trackId: '9', artist: 'Nobody Known', title: 'Unknown Song', durationSec: 200 };
    expect(await s.lookup(nothing)).toEqual({ status: 'none' });
    const before = yt.calls.length;
    clock.now += 6 * DAY;
    expect(await s.lookup(nothing)).toEqual({ status: 'none' });
    expect(yt.calls.length).toBe(before);
    clock.now += 2 * DAY;
    await s.lookup(nothing);
    expect(yt.calls.length).toBeGreaterThan(before);
  });

  test('unused entries dropped after 30 days on load', async () => {
    const clock = { now: T0 };
    const yt = fakeYouTube();
    await service(yt, clock).lookup(qLucky);
    clock.now += 31 * DAY;
    const fresh = service(yt, clock);
    await fresh.load();
    const before = yt.calls.length;
    await fresh.lookup(qLucky);
    expect(yt.calls.slice(before)[0]).toBe('search:video:Daft Punk Get Lucky');
  });

  test('cache persists: a new service answers from the file without fetching', async () => {
    const clock = { now: T0 };
    const yt = fakeYouTube();
    await service(yt, clock).lookup(qLucky);
    const fresh = service(yt, clock);
    await fresh.load();
    const before = yt.calls.length;
    expect(await fresh.lookup(qLucky)).toEqual({ status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' });
    expect(yt.calls.length).toBe(before);
    expect(readFileSync(file, 'utf-8')).not.toContain(KEY);
  });

  test('quota guard: no call that would pass the budget; the counter resets at midnight in California', async () => {
    // 07:59 UTC on 2026-11-08 is still 2026-11-07 in California (PST), 08:01 is the next day.
    const clock = { now: Date.UTC(2026, 10, 8, 7, 59) };
    const yt = fakeYouTube();
    const s = service(yt, clock, { dailyBudget: 150, reserve: 0 });
    expect((await s.lookup(qLucky)).status).toBe('found');
    expect(await s.lookup(q505)).toEqual({ status: 'unavailable' });
    expect(yt.calls.length).toBe(2);
    clock.now = Date.UTC(2026, 10, 8, 8, 1);
    expect(s.unitsToday()).toBe(0);
    expect((await s.lookup({ ...qLucky, trackId: 'other' })).status).toBe('found');
  });

  test('concurrent lookups share one search', async () => {
    const yt = fakeYouTube();
    const s = service(yt, { now: T0 });
    const [a, b] = await Promise.all([s.lookup(qLucky), s.lookup(qLucky)]);
    expect(a).toEqual(b);
    expect(yt.calls.filter((c) => c.startsWith('search')).length).toBe(1);
  });

  test('API error → unavailable, not cached; quotaExceeded stops calls until the next California day', async () => {
    const clock = { now: T0 };
    const quota = json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, 403);
    const failing = fakeYouTube({ fail: quota });
    const s = service(failing, clock);
    expect(await s.lookup(qLucky)).toEqual({ status: 'unavailable' });
    const before = failing.calls.length;
    expect(await s.lookup(q505)).toEqual({ status: 'unavailable' });
    expect(failing.calls.length).toBe(before);
    clock.now += DAY;
    await s.lookup(q505);
    expect(failing.calls.length).toBeGreaterThan(before);
  });

  test('a fake state cannot poison the cache: the answer is tied to artist, title and duration too', async () => {
    const yt = fakeYouTube();
    const s = service(yt, { now: T0 });
    await s.lookup(qLucky);
    const before = yt.calls.length;
    await s.lookup({ ...qLucky, artist: 'Rick Astley', title: 'Never Gonna Give You Up', durationSec: 213 });
    expect(yt.calls.length).toBeGreaterThan(before);
    expect(await s.lookup(qLucky)).toEqual({ status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' });
  });

  test('user uploads (negative ids) are never searched', async () => {
    const yt = fakeYouTube();
    expect(await service(yt, { now: T0 }).lookup({ ...qLucky, trackId: '-123' })).toEqual({ status: 'none' });
    expect(yt.calls).toEqual([]);
  });

  test('a paid search needs mayPay; cached answers do not', async () => {
    const yt = fakeYouTube();
    const s = service(yt, { now: T0 });
    expect(await s.lookup(qLucky, () => false)).toEqual({ status: 'unavailable' });
    expect(yt.calls).toEqual([]);
    await s.lookup(qLucky, () => true);
    expect(await s.lookup(qLucky, () => false)).toEqual({ status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' });
  });

  test('a share of the budget is kept for the owner\'s own links', async () => {
    const yt = fakeYouTube();
    const s = service(yt, { now: T0 }, { dailyBudget: 300, reserve: 250 });
    expect(await s.lookup(qLucky, () => true, false)).toEqual({ status: 'unavailable' });
    expect(yt.calls).toEqual([]);
    expect(await s.lookup(qLucky, () => true, true)).toEqual({ status: 'found', videoId: '5NV6Rdv1a3I', kind: 'audio' });
  });

  test('key never logged', async () => {
    const logs: string[] = [];
    const s = createVideoService({
      fetch: (async () => { throw new Error(`connect failed for https://www.googleapis.com/youtube/v3/search?key=${KEY}`); }) as unknown as typeof fetch,
      key: KEY, file, now: () => T0, log: (m) => logs.push(m),
    });
    expect(await s.lookup(qLucky)).toEqual({ status: 'unavailable' });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join('\n')).not.toContain(KEY);
  });
});
