import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DEFAULT_CONFIG } from '../src/shared/config-schema';
import { readConfigFile } from '../src/main/config-file';

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'breezr-config-'));
  path = join(dir, 'config.json');
});
afterEach(() => {
  if (existsSync(path)) chmodSync(path, 0o600);
  chmodSync(dir, 0o700);
  rmSync(dir, { recursive: true, force: true });
});

test('missing file gives defaults', () => {
  expect(readConfigFile(path).config).toEqual(DEFAULT_CONFIG);
});

test('valid file is read and validated', () => {
  writeFileSync(path, JSON.stringify({ status_name: 'song_title' }));
  expect(readConfigFile(path).config.status_name).toBe('song_title');
});

test('corrupt JSON is moved aside and defaults are used', () => {
  writeFileSync(path, '{ broken');
  const result = readConfigFile(path);
  expect(result.config).toEqual(DEFAULT_CONFIG);
  expect(readdirSync(dir).some((f) => f.startsWith('config.json.bak-'))).toBe(true);
});

test('unreadable file does not throw, even when it cannot be moved aside', () => {
  writeFileSync(path, '{}');
  chmodSync(path, 0o000);
  chmodSync(dir, 0o500); // rename impossible too
  let result: ReturnType<typeof readConfigFile> | undefined;
  expect(() => { result = readConfigFile(path); }).not.toThrow();
  expect(result!.config).toEqual(DEFAULT_CONFIG);
  expect(result!.warnings.length).toBeGreaterThan(0);
});

test('home is passed through to the validation (~ paths)', () => {
  writeFileSync(path, JSON.stringify({ theme: { sourcePaths: { pywal: '~/.cache/wal/colors.json' } } }));
  expect(readConfigFile(path, '/home/u').config.theme.sourcePaths.pywal).toBe('/home/u/.cache/wal/colors.json');
});
