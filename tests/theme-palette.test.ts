import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCaelestiaScheme, type ExternalPalette } from '../src/shared/palette';
import {
  CONTRAST_ACCENT_MIN, CONTRAST_TEXT_MIN, DEFAULT_THEME, buildThemeVars, effectiveLook, themeContrast,
} from '../src/shared/theme-model';
import { savePreset } from '../src/shared/theme-edit';

const T = '--tempo-colors-';
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf-8'));
const v2 = fixture('theme-vars-v2.json') as Record<string, Record<string, string>>;
const caelestia = parseCaelestiaScheme(fixture('caelestia-scheme-dark.json'))!;

describe('no palette = exactly the v2.0 output', () => {
  test('default dark theme', () => expect(buildThemeVars(DEFAULT_THEME)).toEqual(v2.defaultDarkMix));
  test('null palette', () => expect(buildThemeVars(DEFAULT_THEME, null)).toEqual(v2.defaultDarkMix));
  test('light, hsl, with an override', () => {
    expect(buildThemeVars({
      base: 'light', derivation: 'hsl', colors: { accent: '#a0522d', background: '#f4ecd8', text: '#3b2f22' },
      overrides: { '--color-divider-main': '#123456' },
    })).toEqual(v2.sepiaLightHslWithOverride);
  });
});

describe('new theme fields', () => {
  test('defaults: manual source, default paths', () => {
    expect(DEFAULT_THEME.source).toBe('manual');
    expect(DEFAULT_THEME.sourcePaths).toEqual({ caelestia: '', pywal: '' });
  });
});

describe('effectiveLook', () => {
  test('palette colours and base win over the manual ones', () => {
    const look = effectiveLook({ ...DEFAULT_THEME, base: 'light' }, { base: 'dark', colors: { accent: '#00FF00' } });
    expect(look.base).toBe('dark');
    expect(look.colors).toEqual({ ...DEFAULT_THEME.colors, accent: '#00ff00' });
  });
  test('missing or invalid palette colours keep the manual ones', () => {
    const look = effectiveLook(DEFAULT_THEME, { colors: { accent: 'nope', background: undefined } });
    expect(look.colors).toEqual(DEFAULT_THEME.colors);
    expect(look.base).toBe(DEFAULT_THEME.base);
  });
  test('no palette returns the look unchanged', () => expect(effectiveLook(DEFAULT_THEME, null)).toEqual(DEFAULT_THEME));
});

describe('buildThemeVars with a palette', () => {
  test('Caelestia: exact ladder, texts and accent from the source', () => {
    const vars = buildThemeVars(DEFAULT_THEME, caelestia);
    expect(vars[`${T}background-neutral-primary-default`]).toBe('#190427');
    expect(vars[`${T}background-neutral-secondary-default`]).toBe('#1f072f');
    expect(vars[`${T}background-neutral-tertiary-default`]).toBe('#270d38');
    expect(vars[`${T}border-neutral-primary-pressed`]).toBe('#866c95');
    expect(vars[`${T}text-neutral-primary-default`]).toBe('#f5ddff');
    expect(vars[`${T}text-neutral-secondary-default`]).toBe('#bea1cd');
    expect(vars[`${T}background-accent-primary-default`]).toBe('#c39bff');
    expect(vars[`${T}text-accent-onAccent-default`]).toBe('#410084');
    expect(vars['--color-bg-main']).toBe('#190427');
  });

  test('Advanced overrides still win over the source', () => {
    const vars = buildThemeVars({ ...DEFAULT_THEME, overrides: { [`${T}background-neutral-primary-default`]: '#000000' } }, caelestia);
    expect(vars[`${T}background-neutral-primary-default`]).toBe('#000000');
  });

  test('accent-only palette (system) keeps the manual background and text', () => {
    const vars = buildThemeVars(DEFAULT_THEME, { colors: { accent: '#0078d4' } });
    expect(vars[`${T}background-accent-primary-default`]).toBe('#0078d4');
    expect(vars[`${T}background-neutral-primary-default`]).toBe(v2.defaultDarkMix[`${T}background-neutral-primary-default`]);
    expect(vars[`${T}text-neutral-primary-default`]).toBe(v2.defaultDarkMix[`${T}text-neutral-primary-default`]);
  });

  test.each([
    ['too short', ['#000000', '#111111']],
    ['one invalid colour', ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', 'nope']],
    ['too long', Array.from({ length: 9 }, () => '#101010')],
  ])('a %s ladder is ignored (derived instead)', (_label, ladder) => {
    const palette: ExternalPalette = { colors: { background: '#0f0d13' }, ladder: ladder as string[] };
    expect(buildThemeVars(DEFAULT_THEME, palette)[`${T}background-neutral-secondary-default`])
      .toBe(v2.defaultDarkMix[`${T}background-neutral-secondary-default`]);
  });

  test('invalid textSecondary / onAccent fall back to the derivation', () => {
    const vars = buildThemeVars(DEFAULT_THEME, { colors: {}, textSecondary: 'x', onAccent: '#zzzzzz' });
    expect(vars).toEqual(v2.defaultDarkMix);
  });

  test('palette ladder values are renormalized', () => {
    const vars = buildThemeVars(DEFAULT_THEME, { colors: {}, ladder: ['#ABCDEF', '#111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'] });
    expect(vars[`${T}background-neutral-primary-default`]).toBe('#abcdef');
    expect(vars[`${T}background-neutral-primary-hovered`]).toBe('#111111');
  });

  test('every value is valid hex', () => {
    for (const value of Object.values(buildThemeVars(DEFAULT_THEME, caelestia))) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('themeContrast', () => {
  test('thresholds', () => {
    expect(CONTRAST_TEXT_MIN).toBe(4.5);
    expect(CONTRAST_ACCENT_MIN).toBe(3);
  });
  test('the real Caelestia palette is readable', () => {
    const c = themeContrast(buildThemeVars(DEFAULT_THEME, caelestia));
    expect(c.text).toBeGreaterThan(CONTRAST_TEXT_MIN);
    expect(c.accent).toBeGreaterThan(CONTRAST_ACCENT_MIN);
  });
  test('a low-contrast source palette is detected (Review Focus 5)', () => {
    const c = themeContrast(buildThemeVars(DEFAULT_THEME, { colors: { background: '#202020', text: '#303030', accent: '#252525' } }));
    expect(c.text).toBeLessThan(CONTRAST_TEXT_MIN);
    expect(c.accent).toBeLessThan(CONTRAST_ACCENT_MIN);
  });
});

describe('savePreset with a palette', () => {
  test('the preset reproduces exactly what the source showed', () => {
    const theme = { ...DEFAULT_THEME, source: 'caelestia' as const, overrides: { '--color-divider-main': '#123456' } };
    const shown = buildThemeVars(theme, caelestia);
    const saved = savePreset(theme, 'Bureau', 1, caelestia);
    const preset = saved.presets[0];
    expect(preset.base).toBe('dark');
    expect(preset.colors).toEqual({ background: '#190427', text: '#f5ddff', accent: '#c39bff' });
    expect(preset.overrides['--color-divider-main']).toBe('#123456');
    expect(buildThemeVars({ base: preset.base, derivation: preset.derivation, colors: preset.colors, overrides: preset.overrides })).toEqual(shown);
  });

  test('without a palette it behaves as before', () => {
    const saved = savePreset(DEFAULT_THEME, 'Mine', 42);
    expect(saved.presets[0]).toEqual({
      id: 'user-42', name: 'Mine', base: 'dark', derivation: 'mix', colors: DEFAULT_THEME.colors, overrides: {},
    });
  });
});
