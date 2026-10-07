import { app } from 'electron';
import { createTranslator, resolveLocale, type LocaleCode, type Params } from '../shared/i18n';
import { EN, MESSAGES } from '../locales';
import * as Config from './config';

let deezerLanguage: string | undefined;
const listeners = new Set<() => void>();

export function currentLocale(): LocaleCode {
  const chosen = Config.get(app, 'language');
  return chosen !== 'auto' ? chosen : resolveLocale([deezerLanguage, app.getLocale()]);
}

export function t(key: string, params?: Params): string {
  const locale = currentLocale();
  return createTranslator(locale, MESSAGES[locale], EN)(key, params);
}

export function setDeezerLanguage(lang: string | undefined) {
  if (lang === deezerLanguage) return;
  deezerLanguage = lang;
  notifyLocaleChange();
}

export function onLocaleChange(listener: () => void) {
  listeners.add(listener);
}

export function notifyLocaleChange() {
  for (const listener of listeners) listener();
}
