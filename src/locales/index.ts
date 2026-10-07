import type { LocaleCode, Messages } from '../shared/i18n';
import en from './en.json';
import fr from './fr.json';

export const EN: Messages = en;

// Missing locales fall back to English at lookup time.
export const MESSAGES: Partial<Record<LocaleCode, Messages>> = { en, fr };
