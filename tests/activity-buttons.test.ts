import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { activityButtons } from '../src/main/rpc/activity-buttons';
import { buildLiveState } from '../src/main/live-link';

const labels = { play: 'Play on Deezer', lyrics: 'See the lyrics' };

describe('Discord buttons', () => {
  test('Deezer first, then the live link', () => {
    expect(activityButtons('https://www.deezer.com/track/1', 'https://breezr.babas.app/l/x', labels)).toEqual([
      { label: 'Play on Deezer', url: 'https://www.deezer.com/track/1' },
      { label: 'See the lyrics', url: 'https://breezr.babas.app/l/x' },
    ]);
  });
  test('only Deezer without a live link', () => {
    expect(activityButtons('https://www.deezer.com/track/1', undefined, labels)).toEqual([{ label: 'Play on Deezer', url: 'https://www.deezer.com/track/1' }]);
  });
  test('none at all', () => expect(activityButtons(undefined, undefined, labels)).toBeUndefined());
  test('the lyrics button fits Discord\'s 32 characters in every language', () => {
    const dir = join(import.meta.dir, '..', 'src', 'locales');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const label = JSON.parse(readFileSync(join(dir, file), 'utf-8'))['discord.lyricsButton'];
      expect({ file, ok: typeof label === 'string' && label.length > 0 && label.length <= 32 }).toEqual({ file, ok: true });
    }
  });
});

describe('buildLiveState', () => {
  const result = {
    trackId: '67238735', isrc: 'USQX91300108', trackName: 'Get Lucky', artists: 'Daft Punk', albumName: 'RAM',
    coverUrl: 'https://e-cdns-images.dzcdn.net/images/cover/abc/256x256-000000-80-0-0.jpg',
    songTime: 367000, timeLeft: 300000, playing: true, isLivestreamRadio: false,
  };
  test('position and duration from the player', () => {
    expect(buildLiveState(result, 1000)).toEqual({
      track: { id: '67238735', isrc: 'USQX91300108', title: 'Get Lucky', artists: 'Daft Punk', album: 'RAM', cover: result.coverUrl, duration: 367000 },
      playing: true, position: 67000, at: 1000,
    });
  });
  test('a live radio has no duration', () => {
    expect(buildLiveState({ ...result, isLivestreamRadio: true, songTime: 0, timeLeft: -5000 }, 1000)?.track.duration).toBe(0);
  });
  test('nothing to publish without a cover', () => expect(buildLiveState({ ...result, coverUrl: '' }, 1000)).toBeNull());
  test('long titles are shortened rather than dropping the track', () => {
    const long = buildLiveState({ ...result, trackName: '🎵'.repeat(200), artists: 'a'.repeat(400) }, 1000);
    expect(long).not.toBeNull();
    expect(long!.track.title.length).toBeLessThanOrEqual(300);
    expect(long!.track.artists.length).toBe(300);
    expect(long!.track.title.endsWith('\ud83c')).toBe(false);
  });
  test('user-uploaded tracks (negative ids) are published too', () => {
    expect(buildLiveState({ ...result, trackId: '-123456' }, 1000)?.track.id).toBe('-123456');
  });
  test('an invalid ISRC is dropped rather than losing the whole state', () => {
    expect(buildLiveState({ ...result, isrc: 'nope' }, 1000)?.track.isrc).toBeUndefined();
  });
});
