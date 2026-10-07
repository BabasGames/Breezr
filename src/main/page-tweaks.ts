import type { WebContents } from 'electron';
import { pageTweaksCss } from '../shared/page-tweaks';
import { log } from './log';

let inserted: { key: string; css: string } | undefined;

/** Puts the page tweaks matching the settings on the page (the new sheet goes in before the old one comes out). */
export async function applyPageTweaks(wc: WebContents, opts: { animateSidebar: boolean }): Promise<void> {
  const css = pageTweaksCss(opts);
  if (wc.isDestroyed() || inserted?.css === css) return;
  try {
    const key = await wc.insertCSS(css);
    const previous = inserted;
    inserted = { key, css };
    if (previous) await wc.removeInsertedCSS(previous.key);
  } catch (e) {
    log('Window', 'Could not update the page tweaks:', String(e));
  }
}

/** A new document dropped the sheet with the old one. */
export function forgetPageTweaks() {
  inserted = undefined;
}
