import { describe, expect, test } from 'bun:test';
import {
  contrastRatio, hslToRgb, isHex, mix, normalizeHex, parseHex, relativeLuminance, rgbToHsl, shiftLightness, toHex,
} from '../src/shared/color';

describe('parseHex', () => {
  test('6 digits', () => expect(parseHex('#a238ff')).toEqual({ r: 162, g: 56, b: 255 }));
  test('3 digits expand', () => expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 }));
  test('8 digits ignore alpha', () => expect(parseHex('#00000080')).toEqual({ r: 0, g: 0, b: 0 }));
  test('trims and ignores case', () => expect(parseHex('  #A238FF ')).toEqual({ r: 162, g: 56, b: 255 }));
  test.each(['', '#', '#12', '#12345', '#1234567', 'red', 'a238ff', '#ggg', 'rgb(0,0,0)'])('rejects %p', (value) => {
    expect(parseHex(value)).toBeNull();
    expect(isHex(value)).toBe(false);
  });
});

describe('toHex / normalizeHex', () => {
  test('rounds and clamps', () => expect(toHex({ r: 300, g: -5, b: 127.6 })).toBe('#ff0080'));
  test('normalizes short and upper case', () => expect(normalizeHex('#FFF')).toBe('#ffffff'));
  test('returns null on invalid input', () => expect(normalizeHex('nope')).toBeNull());
});

describe('HSL', () => {
  test('pure red', () => expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, l: 0.5 }));
  test.each(['#a238ff', '#0f0d13', '#fdfcfe', '#808080', '#ff0000', '#00ff7f'])('round-trips %p', (hex) => {
    expect(toHex(hslToRgb(rgbToHsl(parseHex(hex)!)))).toBe(hex);
  });
});

describe('mix', () => {
  test('midpoint of black and white', () => expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080'));
  test('t = 0 and t = 1 return the ends', () => {
    expect(mix('#102030', '#ffffff', 0)).toBe('#102030');
    expect(mix('#102030', '#ffffff', 1)).toBe('#ffffff');
  });
  test('t is clamped', () => expect(mix('#000000', '#ffffff', 2)).toBe('#ffffff'));
  test('throws on invalid color', () => expect(() => mix('red', '#ffffff', 0.5)).toThrow());
});

describe('shiftLightness', () => {
  test('positive delta lightens', () => {
    const before = relativeLuminance(parseHex('#404040')!);
    const after = relativeLuminance(parseHex(shiftLightness('#404040', 0.1))!);
    expect(after).toBeGreaterThan(before);
  });
  test('clamps at white and black', () => {
    expect(shiftLightness('#ffffff', 0.2)).toBe('#ffffff');
    expect(shiftLightness('#000000', -0.2)).toBe('#000000');
  });
});

describe('contrastRatio', () => {
  test('black on white is 21', () => expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5));
  test('is symmetric', () => expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5));
  test('same color is 1', () => expect(contrastRatio('#a238ff', '#a238ff')).toBeCloseTo(1, 5));
  test('#777777 on white is just under AA', () => expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2));
});
