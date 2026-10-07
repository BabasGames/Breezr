import type { WebContents } from 'electron';
import type { ExternalPalette } from '../shared/palette';
import { buildThemeVars, themeToCss, type ThemeConfig } from '../shared/theme-model';
import { log } from './log';

let insertedKey: string | undefined;
let insertedCss = '';
// Bumped for every new document: inserted sheets died with the old one.
let documentGeneration = 0;
let queue: Promise<void> = Promise.resolve();

/**
 * Shows `theme` (+ the external palette) in the page. Calls are serialized so fast previews never leave a
 * stale sheet behind; identical CSS is not re-injected.
 */
export function applyTheme(wc: WebContents, theme: ThemeConfig, palette: ExternalPalette | null): Promise<void> {
  const generation = documentGeneration;
  queue = queue.then(async () => {
    // Queued for a document that is gone: the new document's own apply will show the right colours.
    if (wc.isDestroyed() || generation !== documentGeneration) return;
    const css = theme.enabled ? themeToCss(buildThemeVars(theme, palette)) : '';
    if (css === insertedCss) return;

    const mutate = async () => {
      if (wc.isDestroyed() || generation !== documentGeneration) return;
      const oldKey = insertedKey;
      insertedKey = undefined;
      insertedCss = '';
      // New sheet first, old one second: never a frame with Deezer's default colours in between.
      if (css) {
        const key = await wc.insertCSS(css);
        if (wc.isDestroyed() || generation !== documentGeneration) return;
        insertedKey = key;
        insertedCss = css;
      }
      if (oldKey) await wc.removeInsertedCSS(oldKey).catch(() => undefined);
    };

    await mutate();
  }).catch((e) => log('Theme', 'Could not apply the theme:', String(e)));
  return queue;
}

/** A new document drops every inserted sheet, so the old key must not be reused. */
export function forgetInsertedTheme() {
  documentGeneration++;
  insertedKey = undefined;
  insertedCss = '';
}

export async function checkTempoVariables(wc: WebContents) {
  const value = await wc.executeJavaScript(
    'getComputedStyle(document.documentElement).getPropertyValue("--tempo-colors-background-neutral-primary-default")',
  ).catch(() => '');
  if (!String(value).trim()) log('Theme', 'Deezer no longer defines its Tempo color tokens: the custom theme may have no effect');
}
