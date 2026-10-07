import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadSourceCache, saveSourceCache } from '../src/main/source-cache';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'breezr-cache-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('missing cache → null', () => expect(loadSourceCache(dir, 'caelestia:/x')).toBeNull());

test('save then load, per key', () => {
  saveSourceCache(dir, 'caelestia:/x', { colors: { accent: '#111111' } });
  saveSourceCache(dir, 'pywal:/y', { colors: { accent: '#222222' } });
  expect(loadSourceCache(dir, 'caelestia:/x')).toEqual({ colors: { accent: '#111111' } });
  expect(loadSourceCache(dir, 'pywal:/y')).toEqual({ colors: { accent: '#222222' } });
  expect(JSON.parse(readFileSync(join(dir, 'theme-source-cache.json'), 'utf-8'))).toHaveProperty(['caelestia:/x']);
});

test('a corrupt cache file gives null and is overwritten on the next save', () => {
  writeFileSync(join(dir, 'theme-source-cache.json'), '{ broken');
  expect(loadSourceCache(dir, 'caelestia:/x')).toBeNull();
  saveSourceCache(dir, 'caelestia:/x', { colors: { accent: '#333333' } });
  expect(loadSourceCache(dir, 'caelestia:/x')).toEqual({ colors: { accent: '#333333' } });
});

test('an entry that is not a palette is ignored', () => {
  writeFileSync(join(dir, 'theme-source-cache.json'), JSON.stringify({ 'caelestia:/x': 'nope', 'pywal:/y': { colors: 3 } }));
  expect(loadSourceCache(dir, 'caelestia:/x')).toBeNull();
  expect(loadSourceCache(dir, 'pywal:/y')).toBeNull();
});

test('an unwritable folder does not throw', () => {
  expect(() => saveSourceCache(join(dir, 'missing', 'deeper'), 'k', { colors: {} })).not.toThrow();
});
