import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RateLimiter } from '../server/src/rate-limit';
import { LiveStore } from '../server/src/store';
import type { LiveState } from '../src/shared/live';

const state = (title = 'Get Lucky'): LiveState => ({
  track: { id: '1', title, artists: 'Daft Punk', album: 'RAM', cover: 'https://e-cdns-images.dzcdn.net/a.jpg', duration: 248000 },
  playing: true, position: 0, at: 1,
});
const ID = 'k7Qm2xP9ab';
const SECRET = 's'.repeat(43);

describe('RateLimiter', () => {
  test('a burst, then one more per second, per key', () => {
    let now = 0;
    const limiter = new RateLimiter(5, 1, () => now);
    for (let i = 0; i < 5; i++) expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
    now = 1000;
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });
});

describe('LiveStore', () => {
  let dir = '';
  let now = 1000;
  const make = (opts: { maxIds?: number } = {}) => {
    const store = new LiveStore({ file: join(dir, 'ids.json'), now: () => now, idleMs: 600_000, ...opts });
    return store;
  };
  const fresh = () => {
    dir = mkdtempSync(join(tmpdir(), 'breezr-store-'));
    now = 1000;
  };
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('the first write claims an id; only the same secret may write again', async () => {
    fresh();
    const store = make();
    await store.load();
    expect(await store.put(ID, SECRET, state())).toBe('created');
    expect(await store.put(ID, SECRET, state('Next'))).toBe('ok');
    expect(await store.put(ID, 'x'.repeat(43), state('Hijack'))).toBe('forbidden');
    const got = store.get(ID);
    expect(got.status === 'live' && got.state.track.title).toBe('Next');
  });

  test('live, then idle after idleMs without writes; unknown ids', async () => {
    fresh();
    const store = make();
    await store.put(ID, SECRET, state());
    const live = store.get(ID);
    expect(live.status).toBe('live');
    expect(live.status === 'live' && live.receivedAt).toBe(1000);
    now += 600_001;
    expect(store.get(ID).status).toBe('idle');
    expect(store.get('AAAAAAAAAA').status).toBe('unknown');
  });

  test('remove needs the secret and forgets the id', async () => {
    fresh();
    const store = make();
    await store.put(ID, SECRET, state());
    expect(await store.remove(ID, 'x'.repeat(43))).toBe('forbidden');
    expect(await store.remove(ID, SECRET)).toBe('ok');
    expect(store.get(ID).status).toBe('unknown');
    expect(await store.remove(ID, SECRET)).toBe('missing');
  });

  test('claims survive a restart, and the secret is never stored in clear', async () => {
    fresh();
    await make().put(ID, SECRET, state());
    const raw = readFileSync(join(dir, 'ids.json'), 'utf-8');
    expect(raw).not.toContain(SECRET);
    const again = make();
    await again.load();
    expect(await again.put(ID, 'x'.repeat(43), state())).toBe('forbidden');
    expect(await again.put(ID, SECRET, state())).toBe('ok');
  });

  test('refuses new ids once full', async () => {
    fresh();
    const store = make({ maxIds: 2 });
    expect(await store.put('AAAAAAAAAA', SECRET, state())).toBe('created');
    expect(await store.put('BBBBBBBBBB', SECRET, state())).toBe('created');
    expect(await store.put('CCCCCCCCCC', SECRET, state())).toBe('full');
  });

  test('subscribers get every change until they unsubscribe', async () => {
    fresh();
    const store = make();
    const seen: string[] = [];
    const off = store.subscribe(ID, (snap) => seen.push(snap.status === 'live' ? snap.state.track.title : snap.status));
    await store.put(ID, SECRET, state('One'));
    await store.put(ID, SECRET, state('Two'));
    await store.remove(ID, SECRET);
    off();
    await store.put(ID, SECRET, state('Three'));
    expect(seen).toEqual(['One', 'Two', 'unknown']);
  });
});
