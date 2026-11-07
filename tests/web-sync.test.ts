import { describe, expect, test } from 'bun:test';
import { createClock, formatTime } from '../web/src/sync';
import { pickLocale } from '../web/src/i18n';

describe('formatTime', () => {
  test.each([[185000, '3:05'], [3723000, '1:02:03'], [0, '0:00'], [59999, '0:59']])('%d ms → %s', (ms, text) => {
    expect(formatTime(ms)).toBe(text);
  });
});

describe('createClock', () => {
  test('reads the server time from the local clock, whatever their difference', () => {
    expect(createClock(10000, 500).serverTime(2500)).toBe(12000);
  });
});

describe('pickLocale', () => {
  test.each([
    [['fr-FR'], 'fr'], [['pt-BR'], 'pt-BR'], [['pt'], 'pt-BR'], [['zh-Hans-CN', 'zh'], 'zh-CN'], [['xx'], 'en'], [[], 'en'],
  ])('%p → %s', (languages, code) => expect(pickLocale(languages as string[])).toBe(code));
});
