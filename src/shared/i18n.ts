export const LOCALES = ['en', 'fr', 'es', 'de', 'it', 'pt-BR', 'nl', 'pl', 'tr', 'ja', 'ko', 'zh-CN', 'ar', 'ru'] as const;
export type LocaleCode = (typeof LOCALES)[number];
export type Messages = Record<string, string>;
export type Params = Record<string, string | number>;
export type Translate = (key: string, params?: Params) => string;

// Endonyms: each language is listed in its own language, whatever the UI language is.
export const LANGUAGE_NAMES: Record<LocaleCode, string> = {
  en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', it: 'Italiano', 'pt-BR': 'Português (Brasil)',
  nl: 'Nederlands', pl: 'Polski', tr: 'Türkçe', ja: '日本語', ko: '한국어', 'zh-CN': '简体中文', ar: 'العربية', ru: 'Русский',
};

// Languages we only ship in one regional variant.
const LANGUAGE_DEFAULT: Record<string, LocaleCode> = { pt: 'pt-BR', zh: 'zh-CN' };
const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

export function isLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function matchLocale(tag: string | null | undefined): LocaleCode | null {
  const cleaned = tag?.trim().replace(/_/g, '-');
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  const exact = LOCALES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;
  const language = lower.split('-')[0];
  return LOCALES.find((l) => l.toLowerCase() === language) ?? LANGUAGE_DEFAULT[language] ?? null;
}

export function resolveLocale(candidates: (string | null | undefined)[]): LocaleCode {
  for (const candidate of candidates) {
    const match = matchLocale(candidate);
    if (match) return match;
  }
  return 'en';
}

export function isRtl(locale: LocaleCode): boolean {
  return locale === 'ar';
}

export function pluralBase(key: string): string | null {
  const dot = key.lastIndexOf('.');
  return dot > 0 && PLURAL_CATEGORIES.has(key.slice(dot + 1)) ? key.slice(0, dot) : null;
}

function interpolate(text: string, params?: Params): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (params && name in params ? String(params[name]) : match));
}

export function createTranslator(locale: LocaleCode, messages: Messages, fallback: Messages): Translate {
  const rules = new Intl.PluralRules(locale);
  const lookup = (key: string): string | undefined => messages[key] ?? fallback[key];
  return (key, params) => {
    let text: string | undefined;
    if (params && typeof params.count === 'number') {
      text = lookup(`${key}.${rules.select(params.count)}`) ?? lookup(`${key}.other`);
    }
    text ??= lookup(key);
    return interpolate(text ?? key, params);
  };
}
