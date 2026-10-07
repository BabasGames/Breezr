import type { WebContents } from 'electron';
import { buildThemeVars, themeToCss, type ThemeConfig } from '../shared/theme-model';
import { log } from './log';

let insertedKey: string | undefined;
let queue: Promise<void> = Promise.resolve();

/** Replaces the injected theme sheet. Calls are serialized so fast previews never leave a stale sheet behind. */
export function applyTheme(wc: WebContents, theme: ThemeConfig): Promise<void> {
  queue = queue.then(async () => {
    if (wc.isDestroyed()) return;
    if (insertedKey) {
      await wc.removeInsertedCSS(insertedKey).catch(() => undefined);
      insertedKey = undefined;
    }
    if (!theme.enabled) return;
    insertedKey = await wc.insertCSS(themeToCss(buildThemeVars(theme)));
  }).catch((e) => log('Theme', 'Could not apply the theme:', String(e)));
  return queue;
}

/** A new document drops every inserted sheet, so the old key must not be reused. */
export function forgetInsertedTheme() {
  insertedKey = undefined;
}

export async function checkTempoVariables(wc: WebContents) {
  const value = await wc.executeJavaScript(
    'getComputedStyle(document.documentElement).getPropertyValue("--tempo-colors-background-neutral-primary-default")',
  ).catch(() => '');
  if (!String(value).trim()) log('Theme', 'Deezer no longer defines its Tempo color tokens: the custom theme may have no effect');
}
