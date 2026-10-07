import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { LOCALES, pluralBase } from '../src/shared/i18n';

const dir = join(import.meta.dir, '..', 'src', 'locales');
const load = (file: string): Record<string, string> => JSON.parse(readFileSync(join(dir, file), 'utf-8'));
const en = load('en.json');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

const baseKeys = (messages: Record<string, string>) => new Set(Object.keys(messages).map((k) => pluralBase(k) ?? k));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each(files)('%s', (file) => {
  const messages = load(file);

  test('has the same keys as en.json (plural forms aside)', () => {
    expect([...baseKeys(messages)].sort()).toEqual([...baseKeys(en)].sort());
  });

  test('every plural key has an .other form', () => {
    for (const key of Object.keys(messages)) {
      const base = pluralBase(key);
      if (base) expect(messages[`${base}.other`]).toBeDefined();
    }
  });

  test('keeps the placeholders of en.json', () => {
    for (const [key, text] of Object.entries(en)) {
      const base = pluralBase(key);
      if (base && !key.endsWith('.other')) continue;
      expect({ key, p: placeholders(messages[key] ?? '') }).toEqual({ key, p: placeholders(text) });
    }
  });

  test('has no empty strings', () => {
    for (const [key, text] of Object.entries(messages)) expect({ key, empty: text.trim() === '' }).toEqual({ key, empty: false });
  });
});

test('there is exactly one file per supported locale', () => {
  expect(files.map((f) => f.replace(/\.json$/, '')).sort()).toEqual([...LOCALES].sort());
});
