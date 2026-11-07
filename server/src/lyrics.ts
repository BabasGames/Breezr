import type { LyricsResult } from '../../src/shared/live';

const USER_AGENT = 'Breezr (https://github.com/BabasGames/Breezr)';
const DURATION_TOLERANCE_SEC = 3;

export interface LyricsQuery { artist: string; title: string; album: string; durationSec: number }

/** LRC to timed lines: `[mm:ss.xx]` stamps (several per line allowed), `[ar:…]`-style tags dropped. */
export function parseLrc(lrc: string): { t: number; text: string }[] {
  const lines: { t: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (stamps.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const [, min, sec, frac = '0'] of stamps) {
      const ms = Number(frac.padEnd(3, '0').slice(0, 3));
      lines.push({ t: Number(min) * 60_000 + Number(sec) * 1000 + ms, text });
    }
  }
  return lines.sort((a, b) => a.t - b.t);
}

interface LrclibRecord { duration?: number; syncedLyrics?: string | null; plainLyrics?: string | null }

function toResult(record: LrclibRecord | undefined): LyricsResult {
  if (record?.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics);
    if (lines.length > 0) return { kind: 'synced', lines };
  }
  if (record?.plainLyrics?.trim()) return { kind: 'plain', text: record.plainLyrics };
  return { kind: 'none' };
}

/**
 * Lyrics from LRCLIB, looked up once per track: every viewer of every link shares the cache. A failure
 * (network, timeout, bad answer) gives `none` and is not cached, so the next viewer tries again.
 */
export function createLyricsService(opts: {
  fetch: typeof fetch; base?: string; now?: () => number; ttlMs?: number; max?: number; timeoutMs?: number;
}) {
  const base = opts.base ?? 'https://lrclib.net';
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? 86_400_000;
  const max = opts.max ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const cache = new Map<string, { at: number; result: LyricsResult }>();

  async function call(path: string, params: Record<string, string>): Promise<Response> {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); });
    try {
      // The race bounds the wait even if a fetch implementation ignores the abort signal.
      return await Promise.race([
        opts.fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookup(q: LyricsQuery): Promise<LyricsResult> {
    const exact = await call('/api/get', {
      artist_name: q.artist, track_name: q.title, album_name: q.album, duration: String(q.durationSec),
    });
    if (exact.ok) return toResult((await exact.json()) as LrclibRecord);
    if (exact.status !== 404) throw new Error(`LRCLIB ${exact.status}`);
    const search = await call('/api/search', { artist_name: q.artist, track_name: q.title });
    if (!search.ok) throw new Error(`LRCLIB ${search.status}`);
    const records = (await search.json()) as LrclibRecord[];
    const match = Array.isArray(records)
      ? records.find((r) => typeof r.duration === 'number' && Math.abs(r.duration - q.durationSec) <= DURATION_TOLERANCE_SEC)
      : undefined;
    return toResult(match);
  }

  return {
    async get(q: LyricsQuery): Promise<LyricsResult> {
      const key = [q.artist, q.title, q.album, q.durationSec].join('\u0000').toLowerCase();
      const hit = cache.get(key);
      if (hit && now() - hit.at <= ttlMs) return hit.result;
      try {
        const result = await lookup(q);
        cache.delete(key);
        cache.set(key, { at: now(), result });
        // Maps keep insertion order: the first key is the oldest entry.
        if (cache.size > max) cache.delete(cache.keys().next().value as string);
        return result;
      } catch {
        return { kind: 'none' };
      }
    },
  };
}
