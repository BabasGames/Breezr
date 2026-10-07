import { normalizeHex } from './color';
import { buildThemeVars, effectiveLook, isManagedVar, type ManagedVar, type Preset, type ThemeColors, type ThemeConfig } from './theme-model';
import type { ExternalPalette } from './palette';

export function setColor(theme: ThemeConfig, key: keyof ThemeColors, value: string): ThemeConfig {
  const hex = normalizeHex(value);
  return hex ? { ...theme, colors: { ...theme.colors, [key]: hex } } : theme;
}

export function setOverride(theme: ThemeConfig, name: string, value: string): ThemeConfig {
  const hex = normalizeHex(value);
  return hex && isManagedVar(name) ? { ...theme, overrides: { ...theme.overrides, [name]: hex } } : theme;
}

export function resetOverride(theme: ThemeConfig, name: string): ThemeConfig {
  const overrides = { ...theme.overrides };
  delete overrides[name];
  return { ...theme, overrides };
}

export function applyPreset(theme: ThemeConfig, preset: Preset): ThemeConfig {
  return {
    ...theme,
    enabled: true,
    base: preset.base,
    derivation: preset.derivation,
    colors: { ...preset.colors },
    overrides: { ...preset.overrides },
  };
}

/**
 * Saves what is shown as a preset. With an external palette active, the source's colours become the preset's
 * colours, and the values the palette sets exactly (its ladder, secondary text, text on accent) are written as
 * overrides so the preset reproduces the display; the user's own overrides are kept as they are.
 */
export function savePreset(theme: ThemeConfig, name: string, now: number = Date.now(), palette: ExternalPalette | null = null): ThemeConfig {
  const trimmed = name.trim();
  if (!trimmed) return theme;
  const look = effectiveLook(theme, palette);
  const overrides = { ...theme.overrides };
  if (palette && (palette.ladder || palette.textSecondary || palette.onAccent)) {
    const shown = buildThemeVars(theme, palette);
    const fromColours = buildThemeVars({ ...look, overrides: {} });
    for (const [name, value] of Object.entries(shown) as [ManagedVar, string][]) {
      if (!(name in overrides) && value !== fromColours[name]) overrides[name] = value;
    }
  }
  const preset: Preset = {
    id: `user-${now}`,
    name: trimmed,
    base: look.base,
    derivation: theme.derivation,
    colors: { ...look.colors },
    overrides,
  };
  return { ...theme, presets: [...theme.presets, preset] };
}

export function deletePreset(theme: ThemeConfig, id: string): ThemeConfig {
  return { ...theme, presets: theme.presets.filter((p) => p.id !== id) };
}
