import { describe, expect, test } from 'bun:test';
import { contrastRatio, isHex, parseHex, relativeLuminance, rgbToHsl } from '../src/shared/color';
import {
  BUILTIN_PRESETS, DEFAULT_THEME, LADDER_STEPS, MANAGED_VARS, buildThemeVars, deriveLadder, isManagedVar, themeToCss,
  type Derivation,
} from '../src/shared/theme-model';

const lum = (hex: string) => relativeLuminance(parseHex(hex)!);
const sat = (hex: string) => rgbToHsl(parseHex(hex)!).s;
const DERIVATIONS: Derivation[] = ['hsl', 'mix'];
const T = '--tempo-colors-';

describe('deriveLadder', () => {
  test.each(DERIVATIONS)('%s: starts at the background and has the expected length', (derivation) => {
    const ladder = deriveLadder('#0F0D13', 'dark', derivation);
    expect(ladder.length).toBe(LADDER_STEPS);
    expect(ladder[0]).toBe('#0f0d13');
  });

  test.each(DERIVATIONS)('%s on a dark base gets lighter at every step', (derivation) => {
    const ladder = deriveLadder('#0f0d13', 'dark', derivation);
    for (let i = 1; i < ladder.length; i++) expect(lum(ladder[i])).toBeGreaterThan(lum(ladder[i - 1]));
  });

  test.each(DERIVATIONS)('%s on a light base gets darker at every step', (derivation) => {
    const ladder = deriveLadder('#fdfcfe', 'light', derivation);
    for (let i = 1; i < ladder.length; i++) expect(lum(ladder[i])).toBeLessThan(lum(ladder[i - 1]));
  });

  test('mix reproduces Deezer\'s default dark steps closely', () => {
    const ladder = deriveLadder('#0f0d13', 'dark', 'mix');
    // Deezer: bg-secondary #1b191f, bg-tertiary #29282d, divider #555257
    expect(contrastRatio(ladder[1], '#1b191f')).toBeLessThan(1.05);
    expect(contrastRatio(ladder[2], '#29282d')).toBeLessThan(1.05);
    expect(contrastRatio(ladder[6], '#555257')).toBeLessThan(1.05);
  });

  test('hsl keeps a saturated background more saturated than mix does', () => {
    const hsl = deriveLadder('#3a0050', 'dark', 'hsl');
    const mix = deriveLadder('#3a0050', 'dark', 'mix');
    expect(sat(hsl[4])).toBeGreaterThan(sat(mix[4]));
  });

  test.each(['#000000', '#ffffff', '#ff00ff', '#123'])('always returns valid hex for %p', (bg) => {
    for (const derivation of DERIVATIONS) {
      for (const base of ['dark', 'light'] as const) {
        for (const value of deriveLadder(bg, base, derivation)) expect(isHex(value)).toBe(true);
      }
    }
  });
});

describe('buildThemeVars', () => {
  const look = { base: 'dark' as const, derivation: 'mix' as const, colors: { accent: '#a238ff', background: '#0f0d13', text: '#fdfcfe' }, overrides: {} };

  test('produces exactly the managed variables', () => {
    expect(Object.keys(buildThemeVars(look)).sort()).toEqual([...MANAGED_VARS].sort());
  });

  test('maps the three base colors onto both token families', () => {
    const vars = buildThemeVars(look);
    expect(vars[`${T}background-neutral-primary-default`]).toBe('#0f0d13');
    expect(vars[`${T}text-neutral-primary-default`]).toBe('#fdfcfe');
    expect(vars[`${T}background-accent-primary-default`]).toBe('#a238ff');
    expect(vars['--color-bg-main']).toBe('#0f0d13');
    expect(vars['--color-text-main']).toBe('#fdfcfe');
    expect(vars['--color-accent-main']).toBe('#a238ff');
    expect(vars['--color-text-inverse']).toBe('#0f0d13');
  });

  test('backgrounds follow the ladder: primary < secondary < tertiary', () => {
    const vars = buildThemeVars(look);
    expect(lum(vars[`${T}background-neutral-secondary-default`])).toBeGreaterThan(lum(vars[`${T}background-neutral-primary-default`]));
    expect(lum(vars[`${T}background-neutral-tertiary-default`])).toBeGreaterThan(lum(vars[`${T}background-neutral-secondary-default`]));
  });

  test('secondary text sits between text and background', () => {
    const vars = buildThemeVars(look);
    expect(lum(vars[`${T}text-neutral-secondary-default`])).toBeLessThan(lum(vars[`${T}text-neutral-primary-default`]));
    expect(lum(vars[`${T}text-neutral-secondary-default`])).toBeGreaterThan(lum(vars[`${T}background-neutral-primary-default`]));
  });

  test.each(['#a238ff', '#ffe066', '#003366'])('text on accent is the more readable of black and white for %p', (accent) => {
    const onAccent = buildThemeVars({ ...look, colors: { ...look.colors, accent } })[`${T}text-accent-onAccent-default`];
    const other = onAccent === '#000000' ? '#ffffff' : '#000000';
    expect(['#000000', '#ffffff']).toContain(onAccent);
    expect(contrastRatio(onAccent, accent)).toBeGreaterThanOrEqual(contrastRatio(other, accent));
  });

  test('overrides win, unmanaged or invalid overrides are ignored', () => {
    const vars = buildThemeVars({
      ...look,
      overrides: { [`${T}divider-neutral-primary-default`]: '#FF0000', '--color-intent-error': '#00ff00', '--color-bg-secondary': 'nope' },
    });
    expect(vars[`${T}divider-neutral-primary-default`]).toBe('#ff0000');
    expect('--color-intent-error' in vars).toBe(false);
    expect(isHex(vars['--color-bg-secondary'])).toBe(true);
  });

  test('invalid base colors fall back to Deezer colors instead of throwing', () => {
    const vars = buildThemeVars({ ...look, colors: { accent: 'x', background: 'y', text: 'z' } });
    expect(vars['--color-bg-main']).toBe(DEFAULT_THEME.colors.background);
  });

  test('every value is valid hex, on both bases and derivations', () => {
    for (const base of ['dark', 'light'] as const) {
      for (const derivation of DERIVATIONS) {
        for (const value of Object.values(buildThemeVars({ ...look, base, derivation }))) expect(isHex(value)).toBe(true);
      }
    }
  });
});

describe('themeToCss', () => {
  const css = themeToCss({ '--color-b': '#000000', '--color-a': '#ffffff' });
  const selectors = css.slice(0, css.indexOf('{')).split(',').map((x) => x.trim());

  test('marks every variable !important, sorted, once each', () => {
    expect(css).toContain('  --color-a: #ffffff !important;');
    expect(css.indexOf('--color-a')).toBeLessThan(css.indexOf('--color-b'));
    expect(css.match(/--color-a/g)?.length).toBe(1);
  });

  test('themes the page and the parts that share its theme', () => {
    expect(selectors).toContain(':root:not([data-theme])');
    expect(selectors).toContain(':root[data-theme="dark"]');
    expect(selectors).toContain(':root[data-theme="dark"] [data-theme="dark"]');
    expect(selectors).toContain(':root[data-theme="light"]');
    expect(selectors).toContain(':root[data-theme="light"] [data-theme="light"]');
  });

  test('leaves alone the parts Deezer deliberately inverts (lyrics over a light cover)', () => {
    // A bare [data-theme] would also hit a data-theme="light" lyrics panel inside a dark page.
    expect(selectors).not.toContain('[data-theme]');
    expect(selectors.some((x) => x.includes('"dark"') && x.includes('"light"'))).toBe(false);
  });
});

describe('presets and defaults', () => {
  test('built-in preset ids', () => expect(BUILTIN_PRESETS.map((p) => p.id)).toEqual(['deezer', 'midnight', 'neon', 'sepia']));
  test('built-in presets are valid', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.builtin).toBe(true);
      for (const value of Object.values(p.colors)) expect(isHex(value)).toBe(true);
    }
  });
  test('theme is disabled by default', () => expect(DEFAULT_THEME.enabled).toBe(false));
  test('isManagedVar', () => {
    expect(isManagedVar('--color-bg-main')).toBe(true);
    expect(isManagedVar(`${T}text-neutral-primary-default`)).toBe(true);
    expect(isManagedVar('--color-intent-error')).toBe(false);
    expect(isManagedVar(`${T}background-brand-pink-default`)).toBe(false);
  });
});
