import { normalizeHex, parseHex, relativeLuminance } from './color';
import type { Base, ThemeColors } from './theme-model';

// No Node imports here: the settings modal (browser bundle) uses this module too.

export type SourceKind = 'manual' | 'caelestia' | 'pywal' | 'system';
export const SOURCE_KINDS: readonly SourceKind[] = ['manual', 'caelestia', 'pywal', 'system'];

/** Colours an external source provides. Anything absent falls back to the user's manual theme. */
export interface ExternalPalette {
  base?: Base;
  colors: Partial<ThemeColors>;
  /** Exactly 8 background shades, from the background itself to the most contrasted surface. */
  ladder?: string[];
  textSecondary?: string;
  onAccent?: string;
}

export type SourceState = 'ok' | 'missing' | 'invalid' | 'unavailable';
export interface SourceStatus {
  state: SourceState;
  displayPath?: string;
  updatedAt?: number;
  /** The state is not 'ok' but a previous valid palette is still in use. */
  kept?: boolean;
}
export interface SourceUpdate { palette: ExternalPalette | null; status: SourceStatus }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const hex = (v: unknown): string | null => (typeof v === 'string' ? normalizeHex(/^#/.test(v.trim()) ? v : `#${v.trim()}`) : null);

// Caelestia (Material You) roles, from the background to the most contrasted surface.
const CAELESTIA_LADDER = [
  'surface', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh',
  'surfaceContainerHighest', 'surfaceBright', 'outlineVariant', 'outline',
];

/** ~/.local/state/caelestia/scheme.json: `{ mode, colours: { role: "rrggbb" } }`. */
export function parseCaelestiaScheme(raw: unknown): ExternalPalette | null {
  if (!isObj(raw) || !isObj(raw.colours)) return null;
  const c = raw.colours;
  const background = hex(c.surface);
  const text = hex(c.onSurface);
  const accent = hex(c.primary);
  if (!background || !text || !accent) return null;
  const palette: ExternalPalette = { colors: { background, text, accent } };
  if (raw.mode === 'dark' || raw.mode === 'light') palette.base = raw.mode;
  const ladder = CAELESTIA_LADDER.map((role) => hex(c[role]));
  if (ladder.every((v): v is string => v !== null)) palette.ladder = ladder;
  const textSecondary = hex(c.onSurfaceVariant);
  if (textSecondary) palette.textSecondary = textSecondary;
  const onAccent = hex(c.onPrimary);
  if (onAccent) palette.onAccent = onAccent;
  return palette;
}

/** pywal colors.json (also pywal16, and wallust/matugen templates using the same schema). Accent: color1. */
export function parsePywal(raw: unknown): ExternalPalette | null {
  if (!isObj(raw) || !isObj(raw.colors)) return null;
  const colors: string[] = [];
  for (let i = 0; i < 16; i++) {
    const value = hex(raw.colors[`color${i}`]);
    if (!value) return null;
    colors.push(value);
  }
  const special = isObj(raw.special) ? raw.special : {};
  const background = hex(special.background) ?? colors[0];
  const text = hex(special.foreground) ?? colors[15];
  return {
    // Light palettes exist (wal -l): judge by the background itself.
    base: relativeLuminance(parseHex(background)!) > 0.5 ? 'light' : 'dark',
    colors: { background, text, accent: colors[1] },
  };
}

/** systemPreferences.getAccentColor(): 'RRGGBBAA' (Windows, macOS) or '#RRGGBBAA' (Linux); '' when unavailable. */
export function parseAccentColor(raw: string): ExternalPalette | null {
  const value = raw.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{8}$/i.test(value)) return null;
  return { colors: { accent: `#${value.slice(0, 6).toLowerCase()}` } };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (isObj(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  return value;
}

/** Same palette → same string, whatever the key order. Used to skip no-op updates. */
export function paletteFingerprint(palette: ExternalPalette | null): string {
  return JSON.stringify(stable(palette));
}

export interface PathEnv { home: string; XDG_STATE_HOME?: string; XDG_CACHE_HOME?: string; PYWAL_CACHE_DIR?: string }

const isAbsolute = (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
const absOr = (value: string | undefined, fallback: string) => (value && isAbsolute(value) ? value : fallback);
const join = (dir: string, ...parts: string[]) => [dir.replace(/[\\/]+$/, ''), ...parts].join('/');

/** Same lookup rules as Caelestia (XDG_STATE_HOME) and pywal (PYWAL_CACHE_DIR, then XDG_CACHE_HOME). */
export function defaultSourcePath(kind: 'caelestia' | 'pywal', env: PathEnv): string {
  if (kind === 'caelestia') return join(absOr(env.XDG_STATE_HOME, join(env.home, '.local', 'state')), 'caelestia', 'scheme.json');
  const cacheDir = absOr(env.PYWAL_CACHE_DIR, join(absOr(env.XDG_CACHE_HOME, join(env.home, '.cache')), 'wal'));
  return join(cacheDir, 'colors.json');
}

const MAX_PATH = 4096;

/** A user-typed path: trimmed, leading ~ expanded, must end up absolute. '' means "use the default". */
export function normalizeSourcePath(value: unknown, home: string): string {
  if (typeof value !== 'string') return '';
  let path = value.trim();
  if (path === '~' || path.startsWith('~/')) {
    if (!home) return '';
    path = home + path.slice(1);
  }
  if (!path || path.length > MAX_PATH || path.includes('\u0000') || !isAbsolute(path)) return '';
  return path;
}

/** For display only: the real path (with the user name) never leaves the main process. */
export function displayPath(path: string, home: string): string {
  if (home && (path === home || path.startsWith(`${home}/`))) return `~${path.slice(home.length)}`;
  return path;
}

/** A source key as the page may see it ('caelestia:/home/x/…' → 'caelestia:~/…'). */
export function publicSourceKey(key: string, home: string): string {
  const colon = key.indexOf(':');
  return colon < 0 ? key : `${key.slice(0, colon + 1)}${displayPath(key.slice(colon + 1), home)}`;
}
