import { describe, expect, test } from 'bun:test';
import { DEFAULT_CONFIG, validateConfig } from '../src/shared/config-schema';

describe('validateConfig', () => {
  test('non-object input gives defaults with a warning', () => {
    for (const raw of [null, 42, 'x', []]) {
      const { config, warnings } = validateConfig(raw);
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(warnings.length).toBe(1);
    }
  });

  test('empty object gives defaults without warnings', () => {
    expect(validateConfig({})).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
  });

  test('keeps a valid legacy upstream config', () => {
    const { config, warnings } = validateConfig({
      status_name: 'title_and_artists', tooltip_text: 'app_version', dont_close_to_tray: true, window_width: 1280, window_height: 720,
    });
    expect(config.status_name).toBe('title_and_artists');
    expect(config.tooltip_text).toBe('app_version');
    expect(config.dont_close_to_tray).toBe(true);
    expect(config.window_width).toBe(1280);
    expect(warnings).toEqual([]);
  });

  test('converts numeric strings for window sizes, drops nonsense', () => {
    const { config } = validateConfig({ window_width: '1920', window_height: 'tall' });
    expect(config.window_width).toBe(1920);
    expect(config.window_height).toBeUndefined();
  });

  test('replaces invalid fields and keeps the valid ones', () => {
    const { config, warnings } = validateConfig({ status_name: 'nope', dont_close_to_tray: 'yes', language: 'fr' });
    expect(config.status_name).toBe(DEFAULT_CONFIG.status_name);
    expect(config.dont_close_to_tray).toBe(false);
    expect(config.language).toBe('fr');
    expect(warnings.length).toBe(2);
  });

  test('unknown language falls back to auto', () => {
    expect(validateConfig({ language: 'sv' }).config.language).toBe('auto');
  });

  test('partial theme is completed with defaults and colors are normalized', () => {
    const { config } = validateConfig({ theme: { enabled: true, colors: { accent: '#F0F' } } });
    expect(config.theme.enabled).toBe(true);
    expect(config.theme.colors.accent).toBe('#ff00ff');
    expect(config.theme.colors.background).toBe(DEFAULT_CONFIG.theme.colors.background);
    expect(config.theme.derivation).toBe('mix');
  });

  test('theme overrides keep only managed variables with valid colors', () => {
    const { config } = validateConfig({
      theme: { overrides: { '--color-divider-main': '#ABC', '--color-intent-error': '#000000', '--color-bg-main': 'red' } },
    });
    expect(config.theme.overrides).toEqual({ '--color-divider-main': '#aabbcc' });
  });

  test('user presets are validated, broken or built-in ones dropped', () => {
    const good = { id: 'user-1', name: 'Mine', base: 'light', derivation: 'hsl', colors: { accent: '#111111', background: '#eeeeee', text: '#222222' }, overrides: {} };
    const { config } = validateConfig({
      theme: { presets: [good, { id: 'user-2', name: '' }, { id: 'deezer', name: 'Deezer' }, 'junk'] },
    });
    expect(config.theme.presets).toEqual([good]);
  });

  test('does not share objects with DEFAULT_CONFIG', () => {
    const { config } = validateConfig({});
    config.theme.colors.accent = '#000000';
    expect(DEFAULT_CONFIG.theme.colors.accent).not.toBe('#000000');
  });
});
