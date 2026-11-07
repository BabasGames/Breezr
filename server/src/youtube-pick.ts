// Which YouTube video plays a Deezer track: pure rules, fed with what the YouTube Data API returns.

export interface YtVideo { id: string; durationSec: number; embeddable: boolean; channelTitle: string; title: string; description: string }
/** `artist` is the main artist only (see `mainArtist`). */
export interface TrackQuery { trackId: string; artist: string; title: string; durationSec: number }
export type Pick = { videoId: string; kind: 'clip' | 'audio' };

const CLIP_TOLERANCE_SEC = 2;
const AUDIO_TOLERANCE_SEC = 3;
const AUTO_GENERATED = 'Provided to YouTube by';
// Another recording than the track, unless the Deezer title says the same.
const VARIANTS = ['live', 'remix', 'acoustic', 'instrumental', 'karaoke', 'sped up', 'slowed', 'cover', 'lyrics', 'lyric'];

export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m || iso === 'PT') return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Lowercase, no accents, letters and digits of any script kept, everything else a single space. */
export function normalizeName(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * The song name alone: every bracketed part goes ("(Radio Edit - feat. …)", "[ft. …]", "(Live)"), and version
 * suffixes such as " - Remastered 2011". Versions are still told apart: isSameSong checks variant words
 * against the full Deezer title.
 */
export function bareTitle(title: string): string {
  const bare = title
    .replace(/\s*[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s+-\s+(?:[^-]*remaster[^-]*|radio edit|single version|mono|stereo)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  // A title that is only brackets keeps them.
  return bare || title.trim();
}

export function mainArtist(artists: string): string {
  return artists.split(', ')[0].trim();
}

export function isTopicChannelOf(channelTitle: string, artist: string): boolean {
  return normalizeName(channelTitle) === `${normalizeName(artist)} topic`;
}

/** The artist's own channel, or its VEVO one. */
function isArtistChannel(channelTitle: string, artist: string): boolean {
  const channel = normalizeName(channelTitle).replace(/ /g, '');
  const name = normalizeName(artist).replace(/ /g, '');
  return channel === name || channel === `${name}vevo`;
}

const hasWord = (text: string, word: string) => ` ${text} `.includes(` ${word} `);

/** Same song: the video title contains the bare Deezer title and adds no "live", "remix"… the track lacks. */
function isSameSong(videoTitle: string, trackTitle: string): boolean {
  const title = normalizeName(videoTitle);
  const wanted = normalizeName(trackTitle);
  // Whole words: "505" must not match "1505".
  if (!hasWord(title, normalizeName(bareTitle(trackTitle)))) return false;
  return VARIANTS.every((v) => !hasWord(title, v) || hasWord(wanted, v));
}

const isAudioUpload = (v: YtVideo) => hasWord(normalizeName(v.title), 'audio') || v.description.startsWith(AUTO_GENERATED);
const near = (v: YtVideo, q: TrackQuery, tolerance: number) => Math.abs(v.durationSec - q.durationSec) <= tolerance;

/** From a plain search: the artist's clip at ±2 s, else the artist's own audio upload at ±3 s. */
export function pickOfficial(videos: YtVideo[], q: TrackQuery): Pick | null {
  const official = videos.filter((v) => v.embeddable && isArtistChannel(v.channelTitle, q.artist) && isSameSong(v.title, q.title));
  const clip = official.find((v) => !isAudioUpload(v) && near(v, q, CLIP_TOLERANCE_SEC));
  if (clip) return { videoId: clip.id, kind: 'clip' };
  const audio = official.find((v) => isAudioUpload(v) && near(v, q, AUDIO_TOLERANCE_SEC));
  return audio ? { videoId: audio.id, kind: 'audio' } : null;
}

/** From the artist's "- Topic" channel (YouTube Music): the auto-generated upload of the track at ±3 s. */
export function pickTopic(videos: YtVideo[], q: TrackQuery): Pick | null {
  const audio = videos.find((v) => v.embeddable && isTopicChannelOf(v.channelTitle, q.artist) && v.description.startsWith(AUTO_GENERATED)
    && isSameSong(v.title, q.title) && near(v, q, AUDIO_TOLERANCE_SEC));
  return audio ? { videoId: audio.id, kind: 'audio' } : null;
}
