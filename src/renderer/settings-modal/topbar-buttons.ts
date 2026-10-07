// Deezer renders its UI with React. Never replace or remove one of its nodes: React later fails to remove
// it ("removeChild: not a child of this node") and unmounts the whole app — upstream's replaceWith() of the
// logo link blanked the page as soon as the sidebar was collapsed. We only ADD our own elements.

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  forward: svg('<path d="M9 18l6-6-6-6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
};

// Same footprint and colors as Deezer's own top-bar icon buttons (notifications), taken from its Tempo tokens.
const BUTTON_STYLE = [
  'display:inline-flex', 'align-items:center', 'justify-content:center', 'flex-shrink:0',
  'inline-size:32px', 'block-size:32px', 'padding:0', 'border:0', 'border-radius:50%',
  'background:transparent', 'cursor:pointer',
  'color:var(--tempo-colors-icon-neutral-primary-default, currentColor)',
].join(';');

function iconButton(className: string, icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.style.cssText = BUTTON_STYLE;
  button.innerHTML = icon; // static SVG constants only
  button.addEventListener('mouseenter', () => {
    button.style.background = 'var(--tempo-colors-background-neutral-tertiary-hovered, rgb(255 255 255 / 0.1))';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'transparent';
  });
  button.addEventListener('click', onClick);
  return button;
}

export interface TopbarLabels { back: string; forward: string; settings: string }

/**
 * Back/forward at the start of Deezer's top bar, settings just before the notifications bell.
 * Optional: Ctrl+, and the tray still open the settings if Deezer's DOM changes and the buttons cannot be placed.
 */
export function startTopbarButtons(openSettings: () => void, labels: TopbarLabels) {
  const send = (channel: string) => window.ipcRenderer?.send(channel, []);
  const ensure = () => {
    const topbar = document.querySelector('.page-topbar');
    if (!topbar) return;
    if (!topbar.querySelector('.breezr-nav')) {
      const nav = document.createElement('div');
      nav.className = 'breezr-nav';
      nav.style.cssText = 'display:flex;gap:4px;align-items:center;margin-inline-end:12px;flex-shrink:0';
      nav.append(
        iconButton('breezr-back', ICONS.back, labels.back, () => send('nav_back')),
        iconButton('breezr-forward', ICONS.forward, labels.forward, () => send('nav_forward')),
      );
      topbar.prepend(nav);
    }
    if (!topbar.querySelector('.breezr-gear')) {
      const gear = iconButton('breezr-gear', ICONS.gear, labels.settings, openSettings);
      gear.style.marginInlineEnd = '4px';
      const bell = topbar.querySelector('.topbar-action');
      if (bell?.parentElement === topbar) topbar.insertBefore(gear, bell);
      else topbar.append(gear);
    }
  };
  ensure();
  // Deezer re-renders its top bar on some navigations; re-attach when needed. Cheap: one query per second.
  setInterval(ensure, 1000);
}
