import { describe, expect, test } from 'bun:test';
import {
  ID_PATTERN, isStale, lineIndexAt, liveLinkUrl, newLiveCredentials, positionAt, validateLiveState, type LiveState,
} from '../src/shared/live';

const valid = (): LiveState => ({
  track: {
    id: '3135556', isrc: 'GBDUW0000059', title: 'Get Lucky', artists: 'Daft Punk, Pharrell Williams',
    album: 'Random Access Memories', cover: 'https://e-cdns-images.dzcdn.net/images/cover/x/256x256.jpg', duration: 248000,
  },
  playing: true,
  position: 83000,
  at: 1762512000000,
});
const withTrack = (patch: Record<string, unknown>) => ({ ...valid(), track: { ...valid().track, ...patch } });

describe('credentials', () => {
  test('a public id and a secret of the expected shapes', () => {
    const { id, secret } = newLiveCredentials();
    expect(id).toMatch(ID_PATTERN);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  test('two calls give two different ids', () => {
    expect(newLiveCredentials().id).not.toBe(newLiveCredentials().id);
  });
  test('link url', () => {
    expect(liveLinkUrl('k7Qm2xP9ab')).toBe('https://breezr.babas.app/l/k7Qm2xP9ab');
  });
});

describe('validateLiveState', () => {
  test('accepts a complete state', () => expect(validateLiveState(valid())).toEqual(valid()));
  test('accepts a state without isrc', () => {
    const { isrc: _isrc, ...track } = valid().track;
    expect(validateLiveState({ ...valid(), track })).not.toBeNull();
  });
  test('accepts markup, emoji and Arabic as plain text', () => {
    expect(validateLiveState(withTrack({ title: '<script>alert(1)</script> 🎵 مرحبا' }))).not.toBeNull();
  });
  test('titles up to 300 characters', () => {
    expect(validateLiveState(withTrack({ title: 'a'.repeat(300) }))).not.toBeNull();
    expect(validateLiveState(withTrack({ title: 'a'.repeat(301) }))).toBeNull();
  });
  test.each([
    ['http://e-cdns-images.dzcdn.net/a.jpg'],
    ['https://evil.com/a.jpg'],
    ['https://dzcdn.net.evil.com/a.jpg'],
    ['javascript:alert(1)'],
  ])('refuses cover %s', (cover) => expect(validateLiveState(withTrack({ cover }))).toBeNull());
  test('refuses unknown fields at any level', () => {
    expect(validateLiveState({ ...valid(), extra: 1 })).toBeNull();
    expect(validateLiveState(withTrack({ extra: 1 }))).toBeNull();
  });
  test('accepts a live radio (duration 0)', () => {
    expect(validateLiveState({ ...withTrack({ duration: 0 }), position: 5000 })).not.toBeNull();
  });
  test('refuses wrong types', () => {
    expect(validateLiveState({ ...valid(), playing: 'yes' })).toBeNull();
    expect(validateLiveState(withTrack({ id: 'abc' }))).toBeNull();
    expect(validateLiveState(withTrack({ title: '' }))).toBeNull();
    expect(validateLiveState(null)).toBeNull();
  });
});

describe('positionAt', () => {
  test('advances while playing, from the server time the state arrived', () => {
    expect(positionAt(valid(), 3000, 1000)).toBe(85000);
  });
  test('stays put while paused', () => {
    expect(positionAt({ ...valid(), playing: false }, 3000, 1000)).toBe(83000);
  });
  test('never passes the end of the track', () => {
    expect(positionAt(valid(), 10_000_000, 0)).toBe(248000);
  });
  test('unbounded for a live radio', () => {
    expect(positionAt({ ...withTrack({ duration: 0 }) }, 1_000_000, 0)).toBe(1_083_000);
  });
});

describe('isStale', () => {
  test('a link quiet for more than 10 minutes is stale', () => {
    expect(isStale(0, 600_000)).toBe(false);
    expect(isStale(0, 600_001)).toBe(true);
  });
});

describe('lineIndexAt', () => {
  const lines = [{ t: 0 }, { t: 5000 }, { t: 9000 }];
  test('current line', () => {
    expect(lineIndexAt(lines, 4999)).toBe(0);
    expect(lineIndexAt(lines, 5000)).toBe(1);
    expect(lineIndexAt(lines, 99999)).toBe(2);
  });
  test('-1 before the first line', () => expect(lineIndexAt([{ t: 2000 }], 100)).toBe(-1));
});
