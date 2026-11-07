import { describe, expect, test } from 'bun:test';
import { lyricsTime, nextMode, shouldSeek } from '../web/src/music';

describe('music mode', () => {
  test('the choice leads to music or lyrics only', () => {
    expect(nextMode('choice', 'listen')).toBe('music');
    expect(nextMode('choice', 'lyricsOnly')).toBe('lyrics');
  });

  test('the video button switches between lyrics only and music', () => {
    expect(nextMode('lyrics', 'toggleVideo')).toBe('music');
    expect(nextMode('music', 'toggleVideo')).toBe('lyrics');
  });

  test('no video for a track keeps music on: the next track tries again', () => {
    expect(nextMode('music', 'unavailable')).toBe('music');
  });

  test('other events change nothing', () => {
    expect(nextMode('choice', 'toggleVideo')).toBe('choice');
    expect(nextMode('choice', 'unavailable')).toBe('choice');
    expect(nextMode('lyrics', 'listen')).toBe('lyrics');
    expect(nextMode('music', 'lyricsOnly')).toBe('music');
  });
});

describe('drift', () => {
  test('reseek only past 1.5 s, in both directions', () => {
    expect(shouldSeek(10_000, 11_400)).toBe(false);
    expect(shouldSeek(10_000, 11_500)).toBe(false);
    expect(shouldSeek(10_000, 11_600)).toBe(true);
    expect(shouldSeek(12_000, 10_000)).toBe(true);
  });
});

describe('time that drives the lyrics', () => {
  test('music on with a playing video: the video time, so the lyrics follow the sound', () => {
    expect(lyricsTime('music', 42_000, 43_000)).toBe(42_000);
  });

  test('music on but no video time yet: the published position', () => {
    expect(lyricsTime('music', null, 43_000)).toBe(43_000);
  });

  test('lyrics only: the published position', () => {
    expect(lyricsTime('lyrics', 42_000, 43_000)).toBe(43_000);
  });
});
