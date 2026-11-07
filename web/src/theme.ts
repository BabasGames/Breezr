export type ThemeChoice = 'cover' | 'light' | 'dark';
export const THEME_CHOICES: readonly ThemeChoice[] = ['cover', 'light', 'dark'];

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

/** Page background and whether text goes dark on it. */
export function themeColors(choice: ThemeChoice, cover: [number, number, number] | null): { bg: string; light: boolean } {
  if (choice === 'light') return { bg: LIGHT_BG, light: true };
  if (choice === 'dark') return { bg: DARK_BG, light: false };
  if (!cover) return { bg: NEUTRAL, light: false };
  return { bg: `rgb(${cover.join(' ')})`, light: luminance(cover) > 0.45 };
}
