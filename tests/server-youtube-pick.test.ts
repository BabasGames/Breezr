import { describe, expect, test } from 'bun:test';
import {
  bareTitle, isTopicChannelOf, mainArtist, normalizeName, parseIsoDuration, pickOfficial, pickTopic,
  type TrackQuery, type YtVideo,
} from '../server/src/youtube-pick';
import search505 from './fixtures/youtube/505-search.json';
import topic505 from './fixtures/youtube/505-topic.json';
import searchDollar from './fixtures/youtube/dollar-search.json';
import topicDollar from './fixtures/youtube/dollar-topic.json';
import searchLucky from './fixtures/youtube/lucky-search.json';

// Durations as Deezer gives them; the fixtures are YouTube's real answers (2026-11-07).
const q505: TrackQuery = { trackId: '4315389', artist: 'Arctic Monkeys', title: '505', durationSec: 253 };
const qDollar: TrackQuery = { trackId: '445997982', artist: 'Aloe Blacc', title: 'I Need A Dollar', durationSec: 243 };
const qLucky: TrackQuery = { trackId: '66609426', artist: 'Daft Punk', title: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)', durationSec: 248 };

const video = (over: Partial<YtVideo>): YtVideo => ({
  id: 'x', durationSec: 253, embeddable: true, channelTitle: 'Arctic Monkeys', title: 'Arctic Monkeys - 505', description: '', ...over,
});

describe('pickOfficial (first search)', () => {
  test('fan uploads and lyrics videos are never picked, even at the right duration', () => {
    expect(pickOfficial(search505 as YtVideo[], q505)).toBeNull();
  });

  test('the artist\'s own audio upload is picked; label and fan channels are not', () => {
    expect(pickOfficial(searchDollar as YtVideo[], qDollar)).toEqual({ videoId: 'Pqj119D9kDg', kind: 'audio' });
  });

  test('a VEVO "Official Audio" counts as the official audio', () => {
    expect(pickOfficial(searchLucky as YtVideo[], qLucky)).toEqual({ videoId: '5NV6Rdv1a3I', kind: 'audio' });
  });

  test('a clip from the artist at ±2 s is a clip; at 3 s off it is not', () => {
    const clip = video({ id: 'clip', title: 'Arctic Monkeys - 505 (Official Video)', durationSec: 254 });
    expect(pickOfficial([clip], q505)).toEqual({ videoId: 'clip', kind: 'clip' });
    expect(pickOfficial([{ ...clip, durationSec: 256 }], q505)).toBeNull();
  });

  test('a clip wins over an audio upload, whatever their order', () => {
    const audio = video({ id: 'audio', title: 'Arctic Monkeys - 505 (Official Audio)', durationSec: 253 });
    const clip = video({ id: 'clip', title: 'Arctic Monkeys - 505 (Official Video)', durationSec: 253 });
    expect(pickOfficial([audio, clip], q505)).toEqual({ videoId: 'clip', kind: 'clip' });
  });

  test('a video that cannot be embedded is skipped', () => {
    const clip = video({ id: 'clip', title: 'Arctic Monkeys - 505 (Official Video)', embeddable: false });
    expect(pickOfficial([clip], q505)).toBeNull();
  });

  test('a live or remix version from the artist is not the track', () => {
    expect(pickOfficial([video({ id: 'live', title: 'Arctic Monkeys - 505 (Live)' })], q505)).toBeNull();
  });
});

describe('pickTopic (YouTube Music audio)', () => {
  test('505: the studio version, not the live ones', () => {
    expect(pickTopic(topic505 as YtVideo[], q505)).toEqual({ videoId: 'qU9mHegkTc4', kind: 'audio' });
  });

  test('I Need A Dollar: the album version, not "Live In Studio"', () => {
    expect(pickTopic(topicDollar as YtVideo[], qDollar)).toEqual({ videoId: 'cV9mMLDKIbI', kind: 'audio' });
  });

  test('a feat. written differently still matches; a remix does not', () => {
    const provided = 'Provided to YouTube by Columbia';
    const remix = video({ id: 'remix', channelTitle: 'Daft Punk - Topic', title: 'Get Lucky (Daft Punk Remix)', durationSec: 633, description: provided });
    const feat = video({ id: 'feat', channelTitle: 'Daft Punk - Topic', title: 'Get Lucky (feat. Pharrell Williams and Nile Rodgers)', durationSec: 248, description: provided });
    expect(pickTopic([remix, feat], qLucky)).toEqual({ videoId: 'feat', kind: 'audio' });
    expect(pickTopic([remix], qLucky)).toBeNull();
  });

  test('only auto-generated uploads ("Provided to YouTube by") count', () => {
    expect(pickTopic([video({ id: 'a', channelTitle: 'Arctic Monkeys - Topic', title: '505' })], q505)).toBeNull();
  });
});

describe('names and titles', () => {
  test('bare title strips feat and remaster', () => {
    expect(bareTitle('Get Lucky (feat. Pharrell Williams & Nile Rodgers)')).toBe('Get Lucky');
    expect(bareTitle('505 - Remastered 2011')).toBe('505');
    expect(bareTitle('Song [ft. Someone]')).toBe('Song');
    expect(bareTitle('Song - Radio Edit')).toBe('Song');
  });

  test('main artist is the first of the list', () => {
    expect(mainArtist('Daft Punk, Pharrell Williams')).toBe('Daft Punk');
    expect(mainArtist('Queen')).toBe('Queen');
  });

  test('normalize keeps non-Latin letters', () => {
    expect(normalizeName('宇多田ヒカル')).not.toBe('');
    expect(isTopicChannelOf('宇多田ヒカル - Topic', '宇多田ヒカル')).toBe(true);
    expect(normalizeName('Beyoncé')).toBe('beyonce');
    expect(isTopicChannelOf('Arctic Monkeys - Topic', 'Arctic Monkeys')).toBe(true);
    expect(isTopicChannelOf('Alex Turner - Topic', 'Arctic Monkeys')).toBe(false);
  });

  test('ISO 8601 durations', () => {
    expect(parseIsoDuration('PT4M14S')).toBe(254);
    expect(parseIsoDuration('PT10M')).toBe(600);
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('junk')).toBe(0);
  });
});
