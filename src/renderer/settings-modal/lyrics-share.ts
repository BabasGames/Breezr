// Same rule as the top-bar buttons: Deezer renders with React, so we only ADD an element to its lyrics view,
// never replace or remove one of its nodes.

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';

const BUTTON_STYLE = [
  'position:absolute', 'inset-block-start:44px', 'inset-inline-end:88px', 'z-index:1',
  'display:inline-flex', 'align-items:center', 'justify-content:center',
  'inline-size:32px', 'block-size:32px', 'padding:0', 'border:0', 'border-radius:50%',
  'background:transparent', 'cursor:pointer', 'color:currentColor',
].join(';');

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
export function startLyricsShareButton(share: () => Promise<{ url: string }>, labels: { share: string; copied: string }) {
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
    button.addEventListener('mouseenter', () => { button.style.background = 'rgb(127 127 127 / 0.2)'; });
    button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
    button.addEventListener('click', () => {
      share().then(() => toast(labels.copied)).catch(() => undefined);
    });
    view.append(button);
  };
  ensure();
  setInterval(ensure, 1000);
}
