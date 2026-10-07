import { describe, expect, test } from 'bun:test';
import { createTranslator, isRtl, matchLocale, pluralBase, resolveLocale } from '../src/shared/i18n';

describe('matchLocale', () => {
  test.each([
    ['fr', 'fr'], ['fr-FR', 'fr'], ['FR', 'fr'], ['en_GB', 'en'], ['es-MX', 'es'],
    ['pt-BR', 'pt-BR'], ['pt-PT', 'pt-BR'], ['pt', 'pt-BR'], ['zh-CN', 'zh-CN'], ['zh-TW', 'zh-CN'], ['zh-Hant', 'zh-CN'],
  ])('%p → %p', (tag, expected) => expect(matchLocale(tag)).toBe(expected));
  test.each(['', '  ', 'sv', 'xx-YY', null, undefined])('%p → null', (tag) => expect(matchLocale(tag)).toBeNull());
});

describe('resolveLocale', () => {
  test('first supported candidate wins', () => expect(resolveLocale([undefined, 'sv', 'de-AT', 'fr'])).toBe('de'));
  test('falls back to en', () => expect(resolveLocale(['', 'sv', null])).toBe('en'));
});

test('isRtl', () => {
  expect(isRtl('ar')).toBe(true);
  expect(isRtl('fr')).toBe(false);
});

test('pluralBase', () => {
  expect(pluralBase('a.b.one')).toBe('a.b');
  expect(pluralBase('a.b.other')).toBe('a.b');
  expect(pluralBase('a.b')).toBeNull();
  expect(pluralBase('other')).toBeNull();
});

describe('createTranslator', () => {
  const en = { hello: 'Hello {name}', only_en: 'English only', 'items.one': '{count} item', 'items.other': '{count} items' };
  const fr = { hello: 'Bonjour {name}', 'items.one': '{count} élément', 'items.other': '{count} éléments' };
  const ru = { 'items.one': '{count} элемент', 'items.few': '{count} элемента', 'items.many': '{count} элементов', 'items.other': '{count} элемента' };

  test('interpolates', () => expect(createTranslator('fr', fr, en)('hello', { name: 'Babas' })).toBe('Bonjour Babas'));
  test('keeps unknown placeholders', () => expect(createTranslator('fr', fr, en)('hello')).toBe('Bonjour {name}'));
  test('falls back to English, then to the key', () => {
    const t = createTranslator('fr', fr, en);
    expect(t('only_en')).toBe('English only');
    expect(t('missing.key')).toBe('missing.key');
  });
  test('plural forms per language', () => {
    expect(createTranslator('fr', fr, en)('items', { count: 1 })).toBe('1 élément');
    expect(createTranslator('fr', fr, en)('items', { count: 0 })).toBe('0 élément');
    expect(createTranslator('en', en, en)('items', { count: 0 })).toBe('0 items');
    expect(createTranslator('ru', ru, en)('items', { count: 3 })).toBe('3 элемента');
    expect(createTranslator('ru', ru, en)('items', { count: 5 })).toBe('5 элементов');
  });
  test('missing plural category falls back to .other', () => {
    expect(createTranslator('ja', { 'items.other': '{count} 件' }, en)('items', { count: 1 })).toBe('1 件');
  });
  test('ignores inherited Object.prototype keys instead of crashing', () => {
    const t = createTranslator('en', {}, {});
    expect(t('constructor')).toBe('constructor');
    expect(t('toString')).toBe('toString');
    expect(t('__proto__')).toBe('__proto__');
    expect(t('constructor', { count: 1 })).toBe('constructor');
  });
});
