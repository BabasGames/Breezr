import { normalizeHex } from './color';
import { SOURCE_KINDS, normalizeSourcePath, type SourceKind } from './palette';
import { isLocale, type LocaleCode } from './i18n';
import {
  DEFAULT_THEME, isManagedVar, type Base, type Derivation, type Preset, type ThemeColors, type ThemeConfig,
} from './theme-model';

export const STATUS_NAMES = ['app_name', 'song_title', 'artists_song', 'artists_and_title', 'title_and_artists'] as const;
export const TOOLTIP_TEXTS = ['app_name', 'app_version', 'app_name_and_version', 'artists_and_title', 'title_and_artists'] as const;
export type StatusName = (typeof STATUS_NAMES)[number];
export type TooltipText = (typeof TOOLTIP_TEXTS)[number];

export interface BreezrConfig {
  window_width?: number;
  window_height?: number;
  status_name: StatusName;
  tooltip_text: TooltipText;
  dont_close_to_tray: boolean;
  /** Slide Deezer's left menu when it folds/unfolds instead of jumping. */
  animate_sidebar: boolean;
  language: 'auto' | LocaleCode;
  theme: ThemeConfig;
}

export const DEFAULT_CONFIG: BreezrConfig = {
  status_name: 'app_name',
  tooltip_text: 'app_name',
  dont_close_to_tray: false,
  animate_sidebar: true,
  language: 'auto',
  theme: DEFAULT_THEME,
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, path: string, warnings: string[]): T {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  warnings.push(`${path}: invalid value ${JSON.stringify(value)}, using ${JSON.stringify(fallback)}`);
  return fallback;
}

function bool(value: unknown, fallback: boolean, path: string, warnings: string[]): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  warnings.push(`${path}: expected true/false, using ${fallback}`);
  return fallback;
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function colors(value: unknown, fallback: ThemeColors, path: string, warnings: string[]): ThemeColors {
  const source = isObj(value) ? value : {};
  const pick = (key: keyof ThemeColors) => {
    const raw = source[key];
    if (raw === undefined) return fallback[key];
    const hex = typeof raw === 'string' ? normalizeHex(raw) : null;
    if (hex) return hex;
    warnings.push(`${path}.${key}: invalid color, using ${fallback[key]}`);
    return fallback[key];
  };
  return { accent: pick('accent'), background: pick('background'), text: pick('text') };
}

function overrides(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isObj(value)) return result;
  for (const [name, raw] of Object.entries(value)) {
    const hex = typeof raw === 'string' ? normalizeHex(raw) : null;
    if (hex && isManagedVar(name)) result[name] = hex;
  }
  return result;
}

function userPreset(value: unknown): Preset | null {
  if (!isObj(value)) return null;
  const { id, name } = value;
  if (typeof id !== 'string' || !id.startsWith('user-')) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  const ignored: string[] = [];
  return {
    id,
    name: name.trim(),
    base: oneOf<Base>(value.base, ['dark', 'light'], DEFAULT_THEME.base, 'preset', ignored),
    derivation: oneOf<Derivation>(value.derivation, ['hsl', 'mix'], DEFAULT_THEME.derivation, 'preset', ignored),
    colors: colors(value.colors, DEFAULT_THEME.colors, 'preset', ignored),
    overrides: overrides(value.overrides),
  };
}

function sourcePaths(value: unknown, home: string, warnings: string[]): ThemeConfig['sourcePaths'] {
  const source = isObj(value) ? value : {};
  const pick = (key: 'caelestia' | 'pywal') => {
    const raw = source[key];
    if (raw === undefined || raw === '') return '';
    const path = normalizeSourcePath(raw, home);
    if (!path) warnings.push(`theme.sourcePaths.${key}: not an absolute path, using the default`);
    return path;
  };
  return { caelestia: pick('caelestia'), pywal: pick('pywal') };
}

function theme(value: unknown, warnings: string[], home: string): ThemeConfig {
  if (value !== undefined && !isObj(value)) warnings.push('theme: not an object, using defaults');
  const t = isObj(value) ? value : {};
  return {
    enabled: bool(t.enabled, DEFAULT_THEME.enabled, 'theme.enabled', warnings),
    base: oneOf<Base>(t.base, ['dark', 'light'], DEFAULT_THEME.base, 'theme.base', warnings),
    derivation: oneOf<Derivation>(t.derivation, ['hsl', 'mix'], DEFAULT_THEME.derivation, 'theme.derivation', warnings),
    colors: colors(t.colors, DEFAULT_THEME.colors, 'theme.colors', warnings),
    overrides: overrides(t.overrides),
    presets: Array.isArray(t.presets) ? t.presets.map(userPreset).filter((p): p is Preset => p !== null) : [],
    source: oneOf<SourceKind>(t.source, SOURCE_KINDS, DEFAULT_THEME.source, 'theme.source', warnings),
    sourcePaths: sourcePaths(t.sourcePaths, home, warnings),
  };
}

/** `home` expands '~/' in user-typed source paths (none in the browser: such paths then fall back to the default). */
export function validateConfig(raw: unknown, opts: { home?: string } = {}): { config: BreezrConfig; warnings: string[] } {
  const warnings: string[] = [];
  if (!isObj(raw)) {
    warnings.push('config: not an object, using defaults');
    return { config: structuredClone(DEFAULT_CONFIG), warnings };
  }
  const language = raw.language === undefined || raw.language === 'auto' || isLocale(raw.language) ? (raw.language ?? 'auto') : 'auto';
  const config: BreezrConfig = {
    status_name: oneOf(raw.status_name, STATUS_NAMES, DEFAULT_CONFIG.status_name, 'status_name', warnings),
    tooltip_text: oneOf(raw.tooltip_text, TOOLTIP_TEXTS, DEFAULT_CONFIG.tooltip_text, 'tooltip_text', warnings),
    dont_close_to_tray: bool(raw.dont_close_to_tray, DEFAULT_CONFIG.dont_close_to_tray, 'dont_close_to_tray', warnings),
    animate_sidebar: bool(raw.animate_sidebar, DEFAULT_CONFIG.animate_sidebar, 'animate_sidebar', warnings),
    language: language as BreezrConfig['language'],
    theme: theme(raw.theme, warnings, opts.home ?? ''),
  };
  const width = positiveInt(raw.window_width);
  const height = positiveInt(raw.window_height);
  if (width !== undefined) config.window_width = width;
  if (height !== undefined) config.window_height = height;
  return { config: structuredClone(config), warnings };
}
