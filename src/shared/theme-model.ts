import { contrastRatio, mix, normalizeHex, parseHex, rgbToHsl, shiftLightness } from './color';
import type { ExternalPalette, SourceKind } from './palette';

export type Base = 'dark' | 'light';
export type Derivation = 'hsl' | 'mix';
export interface ThemeColors { accent: string; background: string; text: string }
export interface Preset {
  id: string;
  name: string;
  builtin?: boolean;
  base: Base;
  derivation: Derivation;
  colors: ThemeColors;
  overrides: Record<string, string>;
}
export interface ThemeConfig {
  enabled: boolean;
  base: Base;
  derivation: Derivation;
  colors: ThemeColors;
  overrides: Record<string, string>;
  presets: Preset[];
  /** Where colours come from; 'manual' = the colours above (v2.0 behaviour). */
  source: SourceKind;
  /** '' = the default path for that source. */
  sourcePaths: { caelestia: string; pywal: string };
  /** Cross-fade between old and new colours when they change. */
  smoothTransitions: boolean;
}
export type ThemeLook = Pick<ThemeConfig, 'base' | 'derivation' | 'colors' | 'overrides'>;

const T = '--tempo-colors-';

// Deezer's logged-in player is styled by the semantic `--tempo-colors-*` tokens; the older `--color-*`
// set is still used in a few places. Brand, feedback and onDark/onLight tokens are left alone.
// The order is the display order of the Advanced section.
export const MANAGED_VARS = [
  `${T}background-neutral-primary-default`,
  `${T}background-neutral-primary-hovered`,
  `${T}background-neutral-primary-pressed`,
  `${T}background-neutral-secondary-default`,
  `${T}background-neutral-secondary-hovered`,
  `${T}background-neutral-secondary-pressed`,
  `${T}background-neutral-secondary-selected`,
  `${T}background-neutral-tertiary-default`,
  `${T}background-neutral-tertiary-hovered`,
  `${T}background-neutral-tertiary-pressed`,
  `${T}background-neutral-tertiary-disabled`,
  `${T}background-neutral-inverse-default`,
  `${T}border-neutral-primary-default`,
  `${T}border-neutral-primary-hovered`,
  `${T}border-neutral-primary-pressed`,
  `${T}border-neutral-primary-disabled`,
  `${T}border-neutral-primary-focused`,
  `${T}divider-neutral-primary-default`,
  `${T}divider-neutral-primary-disabled`,
  `${T}text-neutral-primary-default`,
  `${T}text-neutral-primary-hovered`,
  `${T}text-neutral-primary-pressed`,
  `${T}text-neutral-primary-disabled`,
  `${T}text-neutral-secondary-default`,
  `${T}text-neutral-inverse-default`,
  `${T}text-neutral-inverse-hovered`,
  `${T}icon-neutral-primary-default`,
  `${T}icon-neutral-primary-hovered`,
  `${T}icon-neutral-secondary-default`,
  `${T}icon-neutral-secondary-hovered`,
  `${T}background-accent-primary-default`,
  `${T}background-accent-primary-hovered`,
  `${T}background-accent-primary-pressed`,
  `${T}background-accent-primary-disabled`,
  `${T}border-accent-primary-default`,
  `${T}border-accent-primary-focused`,
  `${T}text-accent-primary-default`,
  `${T}icon-accent-primary-default`,
  `${T}text-accent-onAccent-default`,
  `${T}text-accent-onAccent-hovered`,
  `${T}text-accent-onAccent-pressed`,
  `${T}text-accent-onAccent-disabled`,
  '--color-bg-main',
  '--color-bg-secondary',
  '--color-bg-tertiary',
  '--color-bg-tertiary-hover',
  '--color-bg-contrast',
  '--color-bg-inverse',
  '--color-divider-main',
  '--color-border-neutral-primary',
  '--color-border-neutral-secondary',
  '--color-text-main',
  '--color-text-secondary',
  '--color-text-disabled',
  '--color-text-inverse',
  '--color-accent-main',
  '--color-accent-strong',
] as const;
export type ManagedVar = (typeof MANAGED_VARS)[number];

const MANAGED_SET: ReadonlySet<string> = new Set(MANAGED_VARS);
export function isManagedVar(name: string): name is ManagedVar {
  return MANAGED_SET.has(name);
}

export const DEEZER_COLORS: ThemeColors = { accent: '#a238ff', background: '#0f0d13', text: '#fdfcfe' };

// How far each step moves away from the background. Calibrated on Deezer's default dark theme:
// #0f0d13 → #1b191f (5 %), #29282d (10 %), #3a393d (≈18 %), #555257 (29 %).
const LADDER_AMOUNTS = [0, 0.05, 0.1, 0.14, 0.18, 0.24, 0.29, 0.34];
export const LADDER_STEPS = LADDER_AMOUNTS.length;

/**
 * Background shades from the background itself ([0]) to the most contrasted surface: lighter on a dark base,
 * darker on a light one. `mix` blends toward white/black (soft, drifts to grey); `hsl` moves lightness by the
 * same proportion but keeps hue and saturation (vivid).
 */
export function deriveLadder(background: string, base: Base, derivation: Derivation): string[] {
  const bg = normalizeHex(background) ?? DEEZER_COLORS.background;
  if (derivation === 'mix') {
    const toward = base === 'dark' ? '#ffffff' : '#000000';
    return LADDER_AMOUNTS.map((amount) => mix(bg, toward, amount));
  }
  const l0 = rgbToHsl(parseHex(bg)!).l;
  const room = base === 'dark' ? 1 - l0 : -l0;
  return LADDER_AMOUNTS.map((amount) => shiftLightness(bg, amount * room));
}

function readableOn(color: string): string {
  return contrastRatio('#000000', color) >= contrastRatio('#ffffff', color) ? '#000000' : '#ffffff';
}

/** The manual look with the source's colours and base on top (invalid source values are ignored). */
export function effectiveLook(look: ThemeLook, palette?: ExternalPalette | null): ThemeLook {
  if (!palette) return look;
  const colors = { ...look.colors };
  for (const key of ['accent', 'background', 'text'] as const) {
    const value = palette.colors[key];
    const hex = typeof value === 'string' ? normalizeHex(value) : null;
    if (hex) colors[key] = hex;
  }
  return { ...look, base: palette.base ?? look.base, colors };
}

function validLadder(ladder: string[] | undefined): string[] | null {
  if (!Array.isArray(ladder) || ladder.length !== LADDER_STEPS) return null;
  const normalized = ladder.map((v) => (typeof v === 'string' ? normalizeHex(v) : null));
  return normalized.every((v): v is string => v !== null) ? normalized : null;
}

/**
 * Deezer variables for a look. Priority: colours derived from the manual theme < the external source's
 * palette (colours, exact ladder and texts when it has them) < the user's Advanced overrides.
 */
export function buildThemeVars(look: ThemeLook, palette?: ExternalPalette | null): Record<ManagedVar, string> {
  const effective = effectiveLook(look, palette);
  const accent = normalizeHex(effective.colors.accent) ?? DEEZER_COLORS.accent;
  const bg = normalizeHex(effective.colors.background) ?? DEEZER_COLORS.background;
  const text = normalizeHex(effective.colors.text) ?? DEEZER_COLORS.text;
  const L = validLadder(palette?.ladder) ?? deriveLadder(bg, effective.base, effective.derivation);
  // Interactive states move away from the background, like Deezer's own hover colors.
  const away = effective.base === 'dark' ? 1 : -1;

  const textHover = mix(text, bg, 0.08);
  const textPressed = mix(text, bg, 0.14);
  const textSecondary = (palette?.textSecondary && normalizeHex(palette.textSecondary)) || mix(text, bg, 0.3);
  const textDisabled = mix(text, bg, 0.55);
  const accentText = shiftLightness(accent, away * 0.08);
  const onAccent = (palette?.onAccent && normalizeHex(palette.onAccent)) || readableOn(accent);

  const vars: Record<ManagedVar, string> = {
    [`${T}background-neutral-primary-default`]: L[0],
    [`${T}background-neutral-primary-hovered`]: L[1],
    [`${T}background-neutral-primary-pressed`]: L[2],
    [`${T}background-neutral-secondary-default`]: L[1],
    [`${T}background-neutral-secondary-hovered`]: L[2],
    [`${T}background-neutral-secondary-pressed`]: L[3],
    [`${T}background-neutral-secondary-selected`]: L[2],
    [`${T}background-neutral-tertiary-default`]: L[2],
    [`${T}background-neutral-tertiary-hovered`]: L[3],
    [`${T}background-neutral-tertiary-pressed`]: L[4],
    [`${T}background-neutral-tertiary-disabled`]: L[4],
    [`${T}background-neutral-inverse-default`]: text,
    [`${T}border-neutral-primary-default`]: L[5],
    [`${T}border-neutral-primary-hovered`]: L[6],
    [`${T}border-neutral-primary-pressed`]: L[7],
    [`${T}border-neutral-primary-disabled`]: L[4],
    [`${T}border-neutral-primary-focused`]: accent,
    [`${T}divider-neutral-primary-default`]: L[3],
    [`${T}divider-neutral-primary-disabled`]: L[2],
    [`${T}text-neutral-primary-default`]: text,
    [`${T}text-neutral-primary-hovered`]: textHover,
    [`${T}text-neutral-primary-pressed`]: textPressed,
    [`${T}text-neutral-primary-disabled`]: textDisabled,
    [`${T}text-neutral-secondary-default`]: textSecondary,
    [`${T}text-neutral-inverse-default`]: bg,
    [`${T}text-neutral-inverse-hovered`]: L[1],
    [`${T}icon-neutral-primary-default`]: text,
    [`${T}icon-neutral-primary-hovered`]: textHover,
    [`${T}icon-neutral-secondary-default`]: textSecondary,
    [`${T}icon-neutral-secondary-hovered`]: mix(text, bg, 0.2),
    [`${T}background-accent-primary-default`]: accent,
    [`${T}background-accent-primary-hovered`]: shiftLightness(accent, away * 0.04),
    [`${T}background-accent-primary-pressed`]: shiftLightness(accent, away * 0.08),
    [`${T}background-accent-primary-disabled`]: mix(accent, bg, 0.75),
    [`${T}border-accent-primary-default`]: accent,
    [`${T}border-accent-primary-focused`]: textHover,
    [`${T}text-accent-primary-default`]: accentText,
    [`${T}icon-accent-primary-default`]: accentText,
    [`${T}text-accent-onAccent-default`]: onAccent,
    [`${T}text-accent-onAccent-hovered`]: onAccent,
    [`${T}text-accent-onAccent-pressed`]: onAccent,
    [`${T}text-accent-onAccent-disabled`]: mix(onAccent, accent, 0.5),
    '--color-bg-main': L[0],
    '--color-bg-secondary': L[1],
    '--color-bg-tertiary': L[2],
    '--color-bg-tertiary-hover': L[4],
    '--color-bg-contrast': L[3],
    '--color-bg-inverse': text,
    '--color-divider-main': L[6],
    '--color-border-neutral-primary': L[6],
    '--color-border-neutral-secondary': text,
    '--color-text-main': text,
    '--color-text-secondary': textSecondary,
    '--color-text-disabled': textDisabled,
    '--color-text-inverse': bg,
    '--color-accent-main': accent,
    '--color-accent-strong': shiftLightness(accent, -away * 0.06),
  } as Record<ManagedVar, string>;

  for (const [name, value] of Object.entries(effective.overrides)) {
    const hex = normalizeHex(value);
    if (hex && isManagedVar(name)) vars[name] = hex;
  }
  return vars;
}

// Theme the page and every part that shares the page's theme. Deezer also inverts some areas on purpose
// (e.g. lyrics over a light album cover get data-theme="light" inside a dark page): forcing our colors there
// put light text on a light background, so subtrees whose theme differs from the page's are left to Deezer.
const THEME_SELECTORS = [
  ':root:not([data-theme])',
  ':root[data-theme="dark"]',
  ':root[data-theme="dark"] [data-theme="dark"]',
  ':root[data-theme="light"]',
  ':root[data-theme="light"] [data-theme="light"]',
].join(', ');

export function themeToCss(vars: Record<string, string>): string {
  // !important: Deezer's dark rules reach (0,3,0) specificity (`.chakra-ui-dark [data-theme]:not([data-theme])`).
  // On custom properties it only beats Deezer's normal declarations, nothing else.
  const lines = Object.keys(vars).sort().map((name) => `  ${name}: ${vars[name]} !important;`);
  return `${THEME_SELECTORS} {\n${lines.join('\n')}\n}\n`;
}

const preset = (id: string, name: string, base: Base, colors: ThemeColors): Preset =>
  ({ id, name, builtin: true, base, derivation: 'mix', colors, overrides: {} });

export const BUILTIN_PRESETS: readonly Preset[] = [
  preset('deezer', 'Deezer', 'dark', DEEZER_COLORS),
  preset('midnight', 'Midnight', 'dark', { accent: '#4f8cff', background: '#0b1020', text: '#e6e9f5' }),
  preset('neon', 'Neon', 'dark', { accent: '#ff2bd6', background: '#0a0a0f', text: '#f0f0ff' }),
  preset('sepia', 'Sepia', 'light', { accent: '#a0522d', background: '#f4ecd8', text: '#3b2f22' }),
];

export const DEFAULT_THEME: ThemeConfig = {
  enabled: false,
  base: 'dark',
  derivation: 'mix',
  colors: { ...DEEZER_COLORS },
  overrides: {},
  presets: [],
  source: 'manual',
  sourcePaths: { caelestia: '', pywal: '' },
  smoothTransitions: true,
};

/** WCAG AA for body text, and the usual 3:1 for large/non-text elements such as the accent. */
export const CONTRAST_TEXT_MIN = 4.5;
export const CONTRAST_ACCENT_MIN = 3;

/** Contrast of the main text and of the accent against the main background, as Deezer will show them. */
export function themeContrast(vars: Record<ManagedVar, string>): { text: number; accent: number } {
  const bg = vars[`${T}background-neutral-primary-default`];
  return {
    text: contrastRatio(vars[`${T}text-neutral-primary-default`], bg),
    accent: contrastRatio(vars[`${T}background-accent-primary-default`], bg),
  };
}
