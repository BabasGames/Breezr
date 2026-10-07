// The page-side half of the theme cross-fade. No Electron import: tested with bun and a fake executor.

export type PageExec = (js: string) => Promise<unknown>;

/**
 * Starts a View Transition in the page. Resolves true once Chromium has captured the old rendering and called
 * our update callback, which then waits for VT_RELEASE_JS (or gives up by itself after 1.5 s). Resolves false
 * when no fade should happen: no API, hidden page, or the user asked the system for less motion.
 */
export const VT_START_JS = `(() => {
  const d = document;
  if (typeof d.startViewTransition !== 'function' || d.visibilityState !== 'visible'
    || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return new Promise((ready) => {
    try {
      const transition = d.startViewTransition({
        update: () => new Promise((done) => {
          window.__breezrThemeDone = done;
          setTimeout(done, 1500);
          ready(true);
        }),
        types: ['breezr-theme'],
      });
      transition.ready.catch(() => ready(false));
      transition.finished.catch(() => undefined);
    } catch {
      ready(false);
    }
  });
})()`;

export const VT_RELEASE_JS = `(() => {
  const done = window.__breezrThemeDone;
  window.__breezrThemeDone = undefined;
  if (done) done();
  return true;
})()`;

/** Duration of our fades only; Deezer's own view transitions (if any) are left alone. */
export const VT_STYLE_CSS = `:root:active-view-transition-type(breezr-theme)::view-transition-old(root),
:root:active-view-transition-type(breezr-theme)::view-transition-new(root) { animation-duration: 600ms; }`;

/** Resolves with the promise's value, or with 'timeout' after `ms` (the promise keeps running). */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Two-step handshake: (1) the page starts the transition and confirms the old state is captured, (2) `mutate`
 * changes the CSS, (3) the page is released and Chromium cross-fades. Every page wait is bounded: a page that
 * reloads or never answers costs at most `timeoutMs`, and the change is then applied directly.
 */
export async function runViewTransition(exec: PageExec, mutate: () => Promise<void>, timeoutMs = 1000): Promise<'faded' | 'direct'> {
  let started: unknown;
  try {
    started = await withTimeout(exec(VT_START_JS), timeoutMs);
  } catch {
    started = false;
  }
  if (started !== true) {
    await mutate();
    return 'direct';
  }
  try {
    await mutate();
  } finally {
    await withTimeout(exec(VT_RELEASE_JS), timeoutMs).catch(() => undefined);
  }
  return 'faded';
}
