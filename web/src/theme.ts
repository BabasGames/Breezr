export type ThemeChoice = 'cover' | 'cover-dark' | 'light' | 'dark';
export const THEME_CHOICES: readonly ThemeChoice[] = ['cover', 'cover-dark', 'light', 'dark'];

const KEY = 'breezr-theme';
const NEUTRAL = '#1b1622';
const LIGHT_BG = '#f6f4f8';
const DARK_BG = '#121014';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** The viewer's saved choice; storage can be missing or blocked (private mode): then the default. */
export function readChoice(storage: Storage | null | undefined): ThemeChoice {
  try {
    const value = storage?.getItem(KEY);
    return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'cover';
  } catch {
    return 'cover';
  }
}

export function saveChoice(storage: Storage | null | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(KEY, choice);
  } catch {
    // Only a convenience: the page works the same without it.
  }
}

const luminance = ([r, g, b]: [number, number, number]) => {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** RGB → HSL (all in 0–1 except hue in degrees). */
function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255)) as [number, number, number];
}

/** The cover's hue, close to black: follows the music without lighting up a dark room. */
function darkened(cover: [number, number, number]): [number, number, number] {
  const [h] = toHsl(cover);
  // How colourful the cover really is (HSL saturation overstates pale colours: cream would turn brown).
  const chroma = (Math.max(...cover) - Math.min(...cover)) / 255;
  return fromHsl([h, Math.min(0.6, chroma * 2), 0.12]);
}

/** Page background and whether text goes dark on it. */
export function themeColors(choice: ThemeChoice, cover: [number, number, number] | null): { bg: string; light: boolean } {
  if (choice === 'light') return { bg: LIGHT_BG, light: true };
  if (choice === 'dark') return { bg: DARK_BG, light: false };
  if (!cover) return { bg: NEUTRAL, light: false };
  if (choice === 'cover-dark') return { bg: `rgb(${darkened(cover).join(' ')})`, light: false };
  return { bg: `rgb(${cover.join(' ')})`, light: luminance(cover) > 0.45 };
}
