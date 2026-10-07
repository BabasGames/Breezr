import { describe, expect, test } from 'bun:test';
import { isNewerRelease, parseVersion } from '../src/shared/version';

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
