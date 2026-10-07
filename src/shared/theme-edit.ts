import { normalizeHex } from './color';
import { isManagedVar, type Preset, type ThemeColors, type ThemeConfig } from './theme-model';

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

export function savePreset(theme: ThemeConfig, name: string, now: number = Date.now()): ThemeConfig {
  const trimmed = name.trim();
  if (!trimmed) return theme;
  const preset: Preset = {
    id: `user-${now}`,
    name: trimmed,
    base: theme.base,
    derivation: theme.derivation,
    colors: { ...theme.colors },
    overrides: { ...theme.overrides },
  };
  return { ...theme, presets: [...theme.presets, preset] };
}

export function deletePreset(theme: ThemeConfig, id: string): ThemeConfig {
  return { ...theme, presets: theme.presets.filter((p) => p.id !== id) };
}
