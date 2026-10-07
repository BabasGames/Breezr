import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SOURCE_KINDS, defaultSourcePath, displayPath, normalizeSourcePath, paletteFingerprint, parseAccentColor, publicSourceKey,
  parseCaelestiaScheme, parsePywal,
} from '../src/shared/palette';

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf-8'));

test('source kinds', () => expect([...SOURCE_KINDS]).toEqual(['manual', 'caelestia', 'pywal', 'system']));

describe('parseCaelestiaScheme', () => {
  test('maps the real dark scheme role by role', () => {
    expect(parseCaelestiaScheme(fixture('caelestia-scheme-dark.json'))).toEqual({
      base: 'dark',
      colors: { background: '#190427', text: '#f5ddff', accent: '#c39bff' },
      ladder: ['#190427', '#1f072f', '#270d38', '#2e1241', '#36174b', '#3e1d54', '#563f65', '#866c95'],
      textSecondary: '#bea1cd',
      onAccent: '#410084',
    });
  });

  test('light mode gives a light base', () => {
    const p = parseCaelestiaScheme(fixture('caelestia-scheme-light.json'))!;
    expect(p.base).toBe('light');
    expect(p.colors.background).toBe('#fdf7ff');
    expect(p.ladder).toHaveLength(8);
  });

  test('a missing ladder role only drops the ladder', () => {
    const raw = fixture('caelestia-scheme-dark.json') as { colours: Record<string, string> };
    delete raw.colours.surfaceContainerHigh;
    const p = parseCaelestiaScheme(raw)!;
    expect(p.ladder).toBeUndefined();
    expect(p.colors.accent).toBe('#c39bff');
  });

  test('an invalid optional role is dropped', () => {
    const raw = fixture('caelestia-scheme-dark.json') as { colours: Record<string, string> };
    raw.colours.onPrimary = 'zzz';
    expect(parseCaelestiaScheme(raw)!.onAccent).toBeUndefined();
  });

  test.each(['surface', 'onSurface', 'primary'])('missing required role %p gives null', (role) => {
    const raw = fixture('caelestia-scheme-dark.json') as { colours: Record<string, string> };
    delete raw.colours[role];
    expect(parseCaelestiaScheme(raw)).toBeNull();
  });

  test('unknown mode keeps the user base', () => {
    const raw = fixture('caelestia-scheme-dark.json') as { mode: string };
    raw.mode = 'auto';
    expect(parseCaelestiaScheme(raw)!.base).toBeUndefined();
  });

  // Each value is wrapped: bun spreads array rows, and a bare [] row would leave the callback without its argument.
  test.each([[null], [undefined], [42], ['x'], [[]], [{}], [{ colours: [] }], [{ colours: 'red' }]])('garbage %p gives null', (raw) => {
    expect(parseCaelestiaScheme(raw)).toBeNull();
  });
});

describe('parsePywal', () => {
  test('pywal schema: special colours, color1 accent, dark base', () => {
    expect(parsePywal(fixture('pywal-colors.json'))).toEqual({
      base: 'dark',
      colors: { background: '#190427', text: '#f5ddff', accent: '#c39bff' },
    });
  });

  test('pywal16: checksum and uppercase hex are fine', () => {
    expect(parsePywal(fixture('pywal16-uppercase.json'))).toEqual({
      base: 'dark',
      colors: { background: '#1a1b26', text: '#c0caf5', accent: '#f7768e' },
    });
  });

  test('without special, falls back to color0 / color15 and detects a light palette', () => {
    expect(parsePywal(fixture('pywal-light.json'))).toEqual({
      base: 'light',
      colors: { background: '#fafafa', text: '#1c1b1f', accent: '#b3261e' },
    });
  });

  test('hex without # is accepted', () => {
    const raw = fixture('pywal-colors.json') as { colors: Record<string, string>; special?: unknown };
    delete raw.special;
    raw.colors.color0 = '190427';
    expect(parsePywal(raw)!.colors.background).toBe('#190427');
  });

  test.each(['color0', 'color1', 'color15'])('missing %p gives null', (key) => {
    const raw = fixture('pywal-colors.json') as { colors: Record<string, string> };
    delete raw.colors[key];
    expect(parsePywal(raw)).toBeNull();
  });

  test('an invalid colour gives null', () => {
    const raw = fixture('pywal-colors.json') as { colors: Record<string, string> };
    raw.colors.color3 = 'not-a-colour';
    expect(parsePywal(raw)).toBeNull();
  });

  test.each([[null], [''], [3], [[]], [{}], [{ colors: [] }]])('garbage %p gives null', (raw) => expect(parsePywal(raw)).toBeNull());
});

describe('parseAccentColor', () => {
  test('Linux format #RRGGBBAA', () => expect(parseAccentColor('#3584E4FF')).toEqual({ colors: { accent: '#3584e4' } }));
  test('Windows/macOS format RRGGBBAA', () => expect(parseAccentColor('0078D4FF')).toEqual({ colors: { accent: '#0078d4' } }));
  test.each(['', '#', 'red', '0078D4', '#0078D4FF00', 'GGGGGGGG'])('%p is unavailable', (raw) => expect(parseAccentColor(raw)).toBeNull());
});

describe('paletteFingerprint', () => {
  test('stable regardless of key order', () => {
    expect(paletteFingerprint({ colors: { accent: '#000000', background: '#ffffff' }, base: 'dark' }))
      .toBe(paletteFingerprint({ base: 'dark', colors: { background: '#ffffff', accent: '#000000' } }));
  });
  test('differs when a colour differs', () => {
    expect(paletteFingerprint({ colors: { accent: '#000000' } })).not.toBe(paletteFingerprint({ colors: { accent: '#000001' } }));
  });
  test('null has its own fingerprint', () => expect(paletteFingerprint(null)).toBe('null'));
});

describe('defaultSourcePath', () => {
  const home = '/home/u';
  test('caelestia default', () => expect(defaultSourcePath('caelestia', { home })).toBe('/home/u/.local/state/caelestia/scheme.json'));
  test('caelestia honours XDG_STATE_HOME', () => {
    expect(defaultSourcePath('caelestia', { home, XDG_STATE_HOME: '/x/state' })).toBe('/x/state/caelestia/scheme.json');
  });
  test('pywal default', () => expect(defaultSourcePath('pywal', { home })).toBe('/home/u/.cache/wal/colors.json'));
  test('pywal honours XDG_CACHE_HOME', () => {
    expect(defaultSourcePath('pywal', { home, XDG_CACHE_HOME: '/x/cache' })).toBe('/x/cache/wal/colors.json');
  });
  test('PYWAL_CACHE_DIR wins over XDG_CACHE_HOME', () => {
    expect(defaultSourcePath('pywal', { home, XDG_CACHE_HOME: '/x/cache', PYWAL_CACHE_DIR: '/p' })).toBe('/p/colors.json');
  });
  test('network (UNC) environment values are ignored', () => {
    expect(defaultSourcePath('pywal', { home, PYWAL_CACHE_DIR: '//attacker/share' })).toBe('/home/u/.cache/wal/colors.json');
  });
  test('relative environment values are ignored', () => {
    expect(defaultSourcePath('caelestia', { home, XDG_STATE_HOME: 'rel/state' })).toBe('/home/u/.local/state/caelestia/scheme.json');
  });
});

describe('normalizeSourcePath', () => {
  const home = '/home/u';
  test('absolute path kept, trimmed', () => expect(normalizeSourcePath('  /a/b.json ', home)).toBe('/a/b.json'));
  test('~/ is expanded', () => expect(normalizeSourcePath('~/x/colors.json', home)).toBe('/home/u/x/colors.json'));
  test('bare ~ is not a .json file', () => expect(normalizeSourcePath('~', home)).toBe(''));
  test('~ without a home gives empty', () => expect(normalizeSourcePath('~/x', '')).toBe(''));
  test.each([['//attacker/share/colors.json'], ['\\\\attacker\\share\\colors.json'], ['/\\attacker/x.json']])(
    'network (UNC) path %p is rejected — opening it would leak Windows credentials', (v) => {
      expect(normalizeSourcePath(v, home)).toBe('');
    });
  test.each([['/etc/passwd'], ['/home/u/.ssh/id_ed25519'], ['/x/colors.json.bak']])('non-.json path %p is rejected', (v) => {
    expect(normalizeSourcePath(v, home)).toBe('');
  });
  test('.JSON in upper case is fine', () => expect(normalizeSourcePath('/x/Colors.JSON', home)).toBe('/x/Colors.JSON'));
  test('Windows drive path is fine', () => expect(normalizeSourcePath('C:\\Users\\u\\colors.json', home)).toBe('C:\\Users\\u\\colors.json'));
  test.each(['', '   ', 'relative/path', './x', 42, null, undefined, '/a\u0000b', `/${'x'.repeat(4096)}`])('%p is rejected', (v) => {
    expect(normalizeSourcePath(v, home)).toBe('');
  });
});

describe('displayPath', () => {
  test('home becomes ~', () => expect(displayPath('/home/u/.cache/wal/colors.json', '/home/u')).toBe('~/.cache/wal/colors.json'));
  test('other paths unchanged', () => expect(displayPath('/etc/x', '/home/u')).toBe('/etc/x'));
  test('a sibling folder sharing the prefix is not shortened', () => expect(displayPath('/home/user2/x', '/home/u')).toBe('/home/user2/x'));
});

describe('publicSourceKey', () => {
  test('shortens the home folder in a file source key', () => {
    expect(publicSourceKey('caelestia:/home/u/.local/state/caelestia/scheme.json', '/home/u')).toBe('caelestia:~/.local/state/caelestia/scheme.json');
  });
  test('other keys unchanged', () => {
    expect(publicSourceKey('manual', '/home/u')).toBe('manual');
    expect(publicSourceKey('system', '/home/u')).toBe('system');
    expect(publicSourceKey('pywal:/etc/colors.json', '/home/u')).toBe('pywal:/etc/colors.json');
    expect(publicSourceKey('pywal:/home/user2/c.json', '/home/u')).toBe('pywal:/home/user2/c.json');
  });
});
