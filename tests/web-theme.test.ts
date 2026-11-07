import { describe, expect, test } from 'bun:test';
import { readChoice, saveChoice, themeColors, THEME_CHOICES } from '../web/src/theme';

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
  test('dark cover: the cover hue, darkened close to black, with light text', () => {
    const red = themeColors('cover-dark', [220, 40, 40]);
    expect(red.light).toBe(false);
    const [r, g, b] = red.bg.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(60);
    const pale = themeColors('cover-dark', [250, 245, 240]);
    expect(pale.light).toBe(false);
    expect(Math.max(...pale.bg.match(/\d+/g)!.map(Number))).toBeLessThanOrEqual(60);
    // A pale cover gives an almost neutral dark grey, not brown.
    const [pr, , pb] = pale.bg.match(/\d+/g)!.map(Number);
    expect(pr - pb).toBeLessThanOrEqual(8);
  });
  test('dark cover with no cover colour yet: the neutral dark tint', () => {
    expect(themeColors('cover-dark', null)).toEqual({ bg: '#1b1622', light: false });
  });
  test('the menu offers four modes, dark cover second', () => {
    expect(THEME_CHOICES).toEqual(['cover', 'cover-dark', 'light', 'dark']);
  });
  test('light and dark ignore the cover', () => {
    expect(themeColors('light', [20, 20, 30])).toEqual({ bg: '#f6f4f8', light: true });
    expect(themeColors('dark', [240, 230, 200])).toEqual({ bg: '#121014', light: false });
  });
});
