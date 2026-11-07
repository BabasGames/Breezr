// Same rule as the top-bar buttons: Deezer renders with React, so we only ADD an element to its lyrics view,
// never replace or remove one of its nodes.

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';

// Deezer's lyrics header is a window-drag area (it can be grabbed to move the window): without no-drag,
// clicks on the button would move the window instead. Its icon colour comes from the light/dark theme
// Deezer puts around the lyrics view, so the button must live inside that view's header.
const BUTTON_STYLE = [
  'display:inline-flex', 'align-items:center', 'justify-content:center', 'flex-shrink:0',
  'inline-size:40px', 'block-size:40px', 'padding:0', 'border:0', 'border-radius:50%',
  'background:transparent', 'cursor:pointer', '-webkit-app-region:no-drag',
  'color:var(--tempo-colors-icon-neutral-primary-default, currentColor)',
].join(';');
const FALLBACK_STYLE = 'position:absolute;inset-block-start:44px;inset-inline-end:88px;z-index:3';

/** The group holding Deezer's own header buttons (the "report a problem" one), right of the close button. */
function headerButtonGroup(view: Element): Element | null {
  for (const el of view.querySelectorAll('*')) {
    if (getComputedStyle(el).gridArea.split(' / ')[0] !== 'header') continue;
    const row = el.firstElementChild;
    return row && row.childElementCount >= 2 ? row.lastElementChild : null;
  }
  return null;
}

const TOAST_STYLE = [
  'position:fixed', 'inset-block-start:84px', 'inset-inline-end:24px', 'z-index:2147483646', 'max-inline-size:320px',
  'padding:10px 14px', 'border-radius:10px', 'font:600 13px/1.4 Inter, system-ui, sans-serif',
  'background:var(--tempo-colors-background-neutral-tertiary-default, #29282d)',
  'color:var(--tempo-colors-text-neutral-primary-default, #fdfcfe)', 'box-shadow:0 8px 24px rgb(0 0 0 / 0.35)',
].join(';');

function toast(text: string) {
  document.querySelector('.breezr-share-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'breezr-share-toast';
  el.setAttribute('role', 'status');
  el.style.cssText = TOAST_STYLE;
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 3000);
}

/**
 * A share button in Deezer's full-screen lyrics view, next to its own buttons. Optional: if Deezer changes
 * that view the button simply does not appear, and the link stays available in the settings.
 */
const BADGE_STYLE = [
  'display:inline-flex', 'align-items:center', 'gap:4px', 'font:600 13px/1 Inter, system-ui, sans-serif',
  'color:var(--tempo-colors-text-neutral-secondary-default, currentColor)', '-webkit-app-region:no-drag',
].join(';');

export function startLyricsShareButton(
  share: () => Promise<{ url: string }>,
  labels: { share: string; copied: string },
  viewers?: { count: () => Promise<number | null>; describe: (count: number) => string },
) {
  const ensure = () => {
    const view = document.querySelector('.player-lyrics-full');
    if (!view || view.querySelector('.breezr-lyrics-share')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'breezr-lyrics-share';
    button.title = labels.share;
    button.setAttribute('aria-label', labels.share);
    button.style.cssText = BUTTON_STYLE;
    button.innerHTML = SHARE_ICON; // static SVG constant only
    button.addEventListener('mouseenter', () => {
      button.style.background = 'var(--tempo-colors-background-neutral-tertiary-hovered, rgb(127 127 127 / 0.2))';
    });
    button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
    button.addEventListener('click', () => {
      share().then(() => toast(labels.copied)).catch(() => undefined);
    });
    const group = headerButtonGroup(view);
    if (group) {
      group.prepend(button);
      if (viewers) group.prepend(viewerBadge(viewers));
    } else {
      // Unknown layout: keep it reachable anyway, top right of the view.
      button.style.cssText += `;${FALLBACK_STYLE}`;
      view.append(button);
    }
  };
  ensure();
  setInterval(ensure, 1000);
}

/** "👁 3": how many people follow the live link, shown only when someone does; refreshed while the view is open. */
function viewerBadge(viewers: { count: () => Promise<number | null>; describe: (count: number) => string }): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'breezr-lyrics-viewers';
  badge.style.cssText = BADGE_STYLE;
  badge.hidden = true;
  const refresh = () => {
    if (!badge.isConnected && badge.dataset.started) return clearInterval(timer);
    badge.dataset.started = '1';
    void viewers.count().then((count) => {
      badge.hidden = !count;
      if (!count) return;
      badge.textContent = `👁 ${count}`;
      badge.title = viewers.describe(count);
    }).catch(() => undefined);
  };
  const timer = setInterval(refresh, 30_000);
  setTimeout(refresh, 0);
  return badge;
}
