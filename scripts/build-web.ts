// Builds the live page into web/dist: index.html, assets/app.js, assets/style.css and, per language,
// assets/i18n/<code>.json with only the `web.*` texts of src/locales (prefix dropped).
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');
const dist = join(root, 'web', 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets', 'i18n'), { recursive: true });

const result = await Bun.build({
  entrypoints: [join(root, 'web', 'src', 'main.ts')],
  target: 'browser',
  minify: true,
  outdir: join(dist, 'assets'),
  naming: 'app.js',
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

copyFileSync(join(root, 'web', 'index.html'), join(dist, 'index.html'));
copyFileSync(join(root, 'web', 'style.css'), join(dist, 'assets', 'style.css'));

const locales = join(root, 'src', 'locales');
for (const file of readdirSync(locales).filter((f) => f.endsWith('.json'))) {
  const messages = JSON.parse(readFileSync(join(locales, file), 'utf-8')) as Record<string, string>;
  const page = Object.fromEntries(Object.entries(messages).filter(([k]) => k.startsWith('web.')).map(([k, v]) => [k.slice(4), v]));
  writeFileSync(join(dist, 'assets', 'i18n', file), JSON.stringify(page));
}
console.log('web/dist built');
