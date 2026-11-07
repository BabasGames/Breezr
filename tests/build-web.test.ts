import { beforeAll, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const dist = join(import.meta.dir, '..', 'web', 'dist');

beforeAll(() => {
  const run = Bun.spawnSync(['bun', join(import.meta.dir, '..', 'scripts', 'build-web.ts')]);
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
});

test('page, script and stylesheet are built', () => {
  for (const file of ['index.html', 'assets/app.js', 'assets/style.css']) expect(existsSync(join(dist, file))).toBe(true);
});

test('the page names its script and stylesheet with a content hash, so caches never mix versions', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf-8');
  expect(html).toMatch(/\/assets\/app\.js\?v=[0-9a-f]{12}"/);
  expect(html).toMatch(/\/assets\/style\.css\?v=[0-9a-f]{12}"/);
  expect(html).toContain('<link rel="icon" href="/assets/icon.png"');
  expect(existsSync(join(dist, 'assets', 'icon.png'))).toBe(true);
});

test('each language gets only the page texts, without the web. prefix', () => {
  const ar = JSON.parse(readFileSync(join(dist, 'assets', 'i18n', 'ar.json'), 'utf-8'));
  expect(typeof ar.idle).toBe('string');
  expect(Object.keys(ar).some((k) => k.startsWith('settings.') || k.startsWith('web.'))).toBe(false);
  expect(existsSync(join(dist, 'assets', 'i18n', 'zh-CN.json'))).toBe(true);
});
