import { describe, expect, test } from 'bun:test';
import { applyPreset, deletePreset, resetOverride, savePreset, setColor, setOverride } from '../src/shared/theme-edit';
import { BUILTIN_PRESETS, DEFAULT_THEME } from '../src/shared/theme-model';

const base = () => structuredClone(DEFAULT_THEME);

describe('setColor', () => {
  test('stores the normalized color', () => expect(setColor(base(), 'accent', '#F0F').colors.accent).toBe('#ff00ff'));
  test('ignores invalid input', () => {
    const theme = base();
    expect(setColor(theme, 'accent', '#12')).toEqual(theme);
  });
  test('does not mutate its input', () => {
    const theme = base();
    setColor(theme, 'text', '#000000');
    expect(theme.colors.text).toBe(DEFAULT_THEME.colors.text);
  });
});

describe('overrides', () => {
  test('set and reset', () => {
    const withOverride = setOverride(base(), '--color-divider-main', '#ABCDEF');
    expect(withOverride.overrides).toEqual({ '--color-divider-main': '#abcdef' });
    expect(resetOverride(withOverride, '--color-divider-main').overrides).toEqual({});
  });
  test('ignores unmanaged variables and invalid colors', () => {
    expect(setOverride(base(), '--color-intent-error', '#000000').overrides).toEqual({});
    expect(setOverride(base(), '--color-divider-main', 'nope').overrides).toEqual({});
  });
});

describe('presets', () => {
  test('applying a preset copies its look and enables the theme', () => {
    const sepia = BUILTIN_PRESETS.find((p) => p.id === 'sepia')!;
    const theme = applyPreset({ ...base(), overrides: { '--color-divider-main': '#000000' } }, sepia);
    expect(theme.enabled).toBe(true);
    expect(theme.base).toBe('light');
    expect(theme.colors).toEqual(sepia.colors);
    expect(theme.overrides).toEqual({});
  });

  test('saving creates a user preset from the current look', () => {
    const theme = savePreset(setColor(base(), 'accent', '#123456'), '  Mine  ', 42);
    expect(theme.presets).toEqual([{
      id: 'user-42', name: 'Mine', base: 'dark', derivation: 'mix',
      colors: { ...DEFAULT_THEME.colors, accent: '#123456' }, overrides: {},
    }]);
  });

  test('saving with an empty name does nothing', () => {
    const theme = base();
    expect(savePreset(theme, '   ', 1)).toEqual(theme);
  });

  test('deleting removes only that user preset', () => {
    const theme = savePreset(savePreset(base(), 'A', 1), 'B', 2);
    expect(deletePreset(theme, 'user-1').presets.map((p) => p.name)).toEqual(['B']);
  });
});
