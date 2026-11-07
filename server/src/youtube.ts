import { readFile, rename, writeFile } from 'node:fs/promises';
import {
  bareTitle, isTopicChannelOf, normalizeName, parseIsoDuration, pickOfficial, pickTopic, type Pick, type TrackQuery, type YtVideo,
} from './youtube-pick';

export type VideoAnswer = { status: 'found'; videoId: string; kind: 'clip' | 'audio' } | { status: 'none' } | { status: 'unavailable' };

interface TrackEntry { videoId: string | null; kind?: 'clip' | 'audio'; fetchedAt: number; usedAt: number }
interface TopicEntry { channelId: string | null; fetchedAt: number; usedAt: number }
interface CacheFile { tracks: Record<string, TrackEntry>; topics: Record<string, TopicEntry> }

const API = 'https://www.googleapis.com/youtube/v3';
const DAY_MS = 86_400_000;
// YouTube API Services policies: API data is refreshed or deleted after 30 days.
const KEEP_MS = 30 * DAY_MS;
const RETRY_NONE_MS = 7 * DAY_MS;
const SEARCH_UNITS = 100;
const VIDEOS_UNITS = 1;
const MAX_RESULTS = '10';

/**
 * Anyone can publish any state on their own link: a track id alone would let a fake "505" titled otherwise
 * poison every link's 505. The answer is tied to what was searched for.
 */
const cacheKey = (q: TrackQuery) => [q.trackId, normalizeName(q.artist), normalizeName(bareTitle(q.title)), q.durationSec].join('|');

class Unavailable extends Error {}

/** The day YouTube counts quota in: it resets at midnight in California. */
const quotaDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(t);

/**
 * Finds the official YouTube video of a track (Data API v3), at most once per track: answers are kept on disk,
 * re-checked after 30 days. Never spends past `dailyBudget` units, and the key never reaches a log line.
 */
export function createVideoService(opts: {
  fetch: typeof fetch; key: string | null; file: string; now?: () => number; timeoutMs?: number; dailyBudget?: number;
  /** Units only the owner's own links may spend: strangers cannot leave them without music for the day. */
  reserve?: number;
  log?: (msg: string) => void;
}) {
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const budget = opts.dailyBudget ?? 9500;
  const reserve = opts.reserve ?? 4000;
  const log = opts.log ?? ((msg: string) => console.error(msg));
  let cache: CacheFile = { tracks: {}, topics: {} };
  let day = quotaDay(now());
  let units = 0;
  // Google said the day's quota is gone: no call until its next day.
  let blockedDay: string | null = null;
  const inFlight = new Map<string, Promise<VideoAnswer>>();
  let dirty = false;
  let writing: Promise<void> | null = null;

  const rollDay = () => {
    const today = quotaDay(now());
    if (today !== day) {
      day = today;
      units = 0;
    }
    return today;
  };

  function spend(cost: number, priority: boolean) {
    if (blockedDay === rollDay()) throw new Unavailable('quota exceeded');
    if (units + cost > (priority ? budget : budget - reserve)) throw new Unavailable('daily budget reached');
    units += cost;
  }

  async function call(path: 'search' | 'videos', params: Record<string, string>, cost: number, priority: boolean): Promise<Record<string, unknown>> {
    spend(cost, priority);
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', opts.key as string);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); });
    let res: Response;
    try {
      res = await Promise.race([opts.fetch(url, { signal: AbortSignal.timeout(timeoutMs) }), timeout]);
    } catch (e) {
      // Error messages can quote the URL, and the URL holds the key: log only the kind of failure.
      log(`youtube: ${path} failed (${e instanceof Error && e.message === 'timeout' ? 'timeout' : 'network error'})`);
      throw new Unavailable('network');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let reason = '';
      try {
        const body = (await res.json()) as { error?: { errors?: { reason?: string }[] } };
        reason = body.error?.errors?.[0]?.reason ?? '';
      } catch {
        // No JSON body: the status says enough.
      }
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') blockedDay = rollDay();
      log(`youtube: ${path} answered ${res.status}${reason ? ` (${reason})` : ''}`);
      throw new Unavailable(`http ${res.status}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async function videos(ids: string[], priority: boolean): Promise<YtVideo[]> {
    if (ids.length === 0) return [];
    const body = await call('videos', { part: 'contentDetails,status,snippet', id: ids.join(',') }, VIDEOS_UNITS, priority);
    const items = Array.isArray(body.items) ? body.items as Record<string, Record<string, unknown>>[] : [];
    return items.map((item) => ({
      id: String(item.id),
      durationSec: parseIsoDuration(String(item.contentDetails?.duration ?? '')),
      embeddable: item.status?.embeddable === true,
      channelTitle: String(item.snippet?.channelTitle ?? ''),
      title: String(item.snippet?.title ?? ''),
      description: String(item.snippet?.description ?? ''),
    }));
  }

  async function searchVideos(params: Record<string, string>, priority: boolean): Promise<YtVideo[]> {
    const body = await call('search', { part: 'id', type: 'video', maxResults: MAX_RESULTS, ...params }, SEARCH_UNITS, priority);
    const items = Array.isArray(body.items) ? body.items as { id?: { videoId?: string } }[] : [];
    return videos(items.map((i) => i.id?.videoId).filter((id): id is string => typeof id === 'string'), priority);
  }

  async function topicChannel(artist: string, priority: boolean): Promise<string | null> {
    const key = normalizeName(artist);
    const known = cache.topics[key];
    const fresh = known && now() - known.fetchedAt <= (known.channelId ? KEEP_MS : RETRY_NONE_MS);
    if (known && fresh) {
      known.usedAt = now();
      return known.channelId;
    }
    const body = await call('search', { part: 'snippet', type: 'channel', maxResults: '5', q: `${artist} - Topic` }, SEARCH_UNITS, priority);
    const items = Array.isArray(body.items) ? body.items as { id?: { channelId?: string }; snippet?: { title?: string } }[] : [];
    const match = items.find((i) => typeof i.id?.channelId === 'string' && isTopicChannelOf(i.snippet?.title ?? '', artist));
    const channelId = match?.id?.channelId ?? null;
    cache.topics[key] = { channelId, fetchedAt: now(), usedAt: now() };
    return channelId;
  }

  async function search(q: TrackQuery, priority: boolean): Promise<Pick | null> {
    const title = bareTitle(q.title);
    const official = pickOfficial(await searchVideos({ q: `${q.artist} ${title}` }, priority), q);
    if (official) return official;
    const channelId = await topicChannel(q.artist, priority);
    if (!channelId) return null;
    return pickTopic(await searchVideos({ q: title, channelId }, priority), q);
  }

  /** A known video older than 30 days: one cheap check that it is still there and embeddable. */
  async function stillThere(videoId: string, priority: boolean): Promise<boolean> {
    const [video] = await videos([videoId], priority);
    return video?.id === videoId && video.embeddable;
  }

  async function resolve(q: TrackQuery, key: string, mayPay: (() => boolean) | undefined, priority: boolean): Promise<VideoAnswer> {
    const known = cache.tracks[key];
    try {
      if (known?.videoId && now() - known.fetchedAt > KEEP_MS && await stillThere(known.videoId, priority)) {
        known.fetchedAt = known.usedAt = now();
        await persist();
        return { status: 'found', videoId: known.videoId, kind: known.kind ?? 'audio' };
      }
      // A full search costs 100 to 300 units: the caller decides whether this requester may spend them.
      if (mayPay && !mayPay()) return { status: 'unavailable' };
      const pick = await search(q, priority);
      cache.tracks[key] = { videoId: pick?.videoId ?? null, kind: pick?.kind, fetchedAt: now(), usedAt: now() };
      // Saved before answering: a restart right after a paid search must not pay for it again.
      await persist();
      return pick ? { status: 'found', ...pick } : { status: 'none' };
    } catch (e) {
      if (!(e instanceof Unavailable)) log('youtube: lookup failed');
      return { status: 'unavailable' };
    }
  }

  function purge() {
    const limit = now() - KEEP_MS;
    for (const store of [cache.tracks, cache.topics] as Record<string, { usedAt: number }>[]) {
      for (const [k, entry] of Object.entries(store)) {
        if (entry.usedAt < limit) {
          delete store[k];
          dirty = true;
        }
      }
    }
  }

  /** One write at a time, as in LiveStore: a failed write is logged and retried with the next change. */
  function persist(): Promise<void> {
    dirty = true;
    writing ??= (async () => {
      try {
        while (dirty) {
          dirty = false;
          try {
            await writeFile(`${opts.file}.tmp`, JSON.stringify(cache), { mode: 0o600 });
            await rename(`${opts.file}.tmp`, opts.file);
          } catch (e) {
            log(`youtube: could not save the cache: ${String(e)}`);
            dirty = true;
            break;
          }
        }
      } finally {
        writing = null;
      }
    })();
    return writing;
  }

  return {
    async load(): Promise<void> {
      try {
        const raw = JSON.parse(await readFile(opts.file, 'utf-8')) as Partial<CacheFile>;
        cache = { tracks: raw.tracks ?? {}, topics: raw.topics ?? {} };
      } catch (e) {
        if ((e as { code?: string }).code !== 'ENOENT') log(`youtube: cache unreadable, starting empty: ${String(e)}`);
      }
      purge();
      if (dirty) await persist();
    },

    /** `mayPay` is asked only before a paid search, never for an answer already known. */
    async lookup(q: TrackQuery, mayPay?: () => boolean, priority = false): Promise<VideoAnswer> {
      // Negative ids are the owner's own uploads: not on YouTube.
      if (q.trackId.startsWith('-')) return { status: 'none' };
      if (!opts.key) return { status: 'unavailable' };
      const key = cacheKey(q);
      const known = cache.tracks[key];
      if (known) {
        const age = now() - known.fetchedAt;
        if (known.videoId && age <= KEEP_MS) {
          // Day precision is enough for the 30-day cleanup: save the date at most once a day.
          if (now() - known.usedAt > DAY_MS) {
            known.usedAt = now();
            void persist();
          }
          return { status: 'found', videoId: known.videoId, kind: known.kind ?? 'audio' };
        }
        if (!known.videoId && age <= RETRY_NONE_MS) return { status: 'none' };
      }
      let pending = inFlight.get(key);
      if (!pending) {
        pending = resolve(q, key, mayPay, priority).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return pending;
    },

    unitsToday(): number {
      rollDay();
      return units;
    },
  };
}
