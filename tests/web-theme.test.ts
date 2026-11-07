import { describe, expect, test } from 'bun:test';
import { readChoice, saveChoice, themeColors } from '../web/src/theme';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('theme choice', () => {
  test('cover colour by default, then whatever was saved', () => {
    const storage = memory();
    expect(readChoice(storage)).toBe('cover');
    saveChoice(storage, 'dark');
    expect(readChoice(storage)).toBe('dark');
  });
  test('an unknown saved value falls back to the cover colour', () => {
    const storage = memory();
    storage.setItem('breezr-theme', 'purple');
    expect(readChoice(storage)).toBe('cover');
  });
  test('blocked storage (private mode) never breaks the page', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readChoice(blocked)).toBe('cover');
    expect(() => saveChoice(blocked, 'light')).not.toThrow();
  });
});

describe('themeColors', () => {
  test('cover: the cover colour, dark text on a light cover', () => {
    expect(themeColors('cover', [240, 230, 200])).toEqual({ bg: 'rgb(240 230 200)', light: true });
    expect(themeColors('cover', [20, 20, 30])).toEqual({ bg: 'rgb(20 20 30)', light: false });
  });
  test('cover not readable yet: the neutral dark tint', () => {
    expect(themeColors('cover', null)).toEqual({ bg: '#1b1622', light: false });
  });
  test('light and dark ignore the cover', () => {
    expect(themeColors('light', [20, 20, 30])).toEqual({ bg: '#f6f4f8', light: true });
    expect(themeColors('dark', [240, 230, 200])).toEqual({ bg: '#121014', light: false });
  });
});
