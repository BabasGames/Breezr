import { isRtl, resolveLocale, type LocaleCode } from '../../src/shared/i18n';

export type T = (key: string) => string;

/** The first of the browser's languages that Breezr speaks, English otherwise. */
export function pickLocale(languages: readonly string[]): LocaleCode {
  return resolveLocale([...languages]);
}

/** Loads the page texts for the browser's language and sets `lang`/`dir` on the document. */
export async function loadI18n(): Promise<T> {
  const locale = pickLocale(navigator.languages ?? [navigator.language]);
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  const load = async (code: LocaleCode): Promise<Record<string, string>> => {
    try {
      const res = await fetch(`/assets/i18n/${code}.json`);
      return res.ok ? ((await res.json()) as Record<string, string>) : {};
    } catch {
      return {};
    }
  };
  const empty: Record<string, string> = {};
  const [messages, fallback] = await Promise.all([load(locale), locale === 'en' ? Promise.resolve(empty) : load('en')]);
  return (key) => messages[key] ?? fallback[key] ?? key;
}
