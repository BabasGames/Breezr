import { describe, expect, test } from 'bun:test';
import { isNewerRelease, latestReleaseTag, parseVersion } from '../src/shared/version';

describe('parseVersion', () => {
  test('parses plain and v-prefixed versions', () => {
    expect(parseVersion('2.0.0')).toEqual([2, 0, 0]);
    expect(parseVersion('v2.10.3')).toEqual([2, 10, 3]);
  });
  test('rejects garbage', () => {
    expect(parseVersion(undefined)).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
  });
});

describe('isNewerRelease', () => {
  test('newer patch, minor, major', () => {
    expect(isNewerRelease('2.0.1', '2.0.0')).toBe(true);
    expect(isNewerRelease('v2.1.0', '2.0.9')).toBe(true);
    expect(isNewerRelease('3.0.0', '2.9.9')).toBe(true);
  });
  test('same or older is not newer', () => {
    expect(isNewerRelease('2.0.0', '2.0.0')).toBe(false);
    expect(isNewerRelease('1.4.0', '2.0.0')).toBe(false);
  });
  test('no release yet (404 body) is not newer', () => {
    expect(isNewerRelease(undefined, '2.0.0')).toBe(false);
    expect(isNewerRelease(null, '2.0.0')).toBe(false);
  });
});

describe('latestReleaseTag', () => {
  test('reads tag_name from a successful answer', () => expect(latestReleaseTag(200, { tag_name: '2.1.0' })).toBe('2.1.0'));
  test('404 means no release published yet: nothing to offer', () => expect(latestReleaseTag(404, { message: 'Not Found' })).toBe(''));
  test('a successful answer without a tag gives nothing', () => expect(latestReleaseTag(200, {})).toBe(''));
  test.each([403, 429, 500, 503])('HTTP %p is an error, not "up to date"', (status) => {
    expect(() => latestReleaseTag(status, { message: 'API rate limit exceeded' })).toThrow(String(status));
  });
});
