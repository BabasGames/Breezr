import { BrowserWindow, type WebContents } from 'electron';
import type { ExternalPalette } from '../shared/palette';
import { buildThemeVars, themeToCss, type ThemeConfig } from '../shared/theme-model';
import { log } from './log';
import { VT_STYLE_CSS, runViewTransition } from './view-transition';

export { runViewTransition, type PageExec } from './view-transition';

let insertedKey: string | undefined;
let insertedCss = '';
// Bumped for every new document: inserted sheets died with the old one.
let documentGeneration = 0;
let queue: Promise<void> = Promise.resolve();

/**
 * Shows `theme` (+ the external palette) in the page. Calls are serialized so fast previews never leave a
 * stale sheet behind; identical CSS is not re-injected. With `transition`, the change cross-fades — unless the
 * theme's own setting says no, or the window is hidden/minimized (nobody would see it, and a hidden page skips
 * View Transitions anyway).
 */
export function applyTheme(wc: WebContents, theme: ThemeConfig, palette: ExternalPalette | null, opts: { transition: boolean }): Promise<void> {
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

    const win = BrowserWindow.fromWebContents(wc);
    const visible = !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
    if (opts.transition && theme.smoothTransitions && visible) {
      await runViewTransition((js) => wc.executeJavaScript(js), mutate);
    } else {
      await mutate();
    }
  }).catch((e) => log('Theme', 'Could not apply the theme:', String(e)));
  return queue;
}

/** A new document drops every inserted sheet, so the old key must not be reused. */
export function forgetInsertedTheme() {
  documentGeneration++;
  insertedKey = undefined;
  insertedCss = '';
}

/** Duration of our cross-fades; a permanent sheet, separate from the theme one (once per document). */
export async function installTransitionStyle(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  await wc.insertCSS(VT_STYLE_CSS).catch((e) => log('Theme', 'Could not install the transition style:', String(e)));
}

export async function checkTempoVariables(wc: WebContents) {
  const value = await wc.executeJavaScript(
    'getComputedStyle(document.documentElement).getPropertyValue("--tempo-colors-background-neutral-primary-default")',
  ).catch(() => '');
  if (!String(value).trim()) log('Theme', 'Deezer no longer defines its Tempo color tokens: the custom theme may have no effect');
}
