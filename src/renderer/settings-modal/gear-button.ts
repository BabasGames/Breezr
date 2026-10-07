const GEAR_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// Same footprint and colors as Deezer's own top-bar icon buttons (notifications), taken from its Tempo tokens.
const BUTTON_STYLE = [
  'display:inline-flex', 'align-items:center', 'justify-content:center',
  'inline-size:32px', 'block-size:32px', 'padding:0', 'margin-inline-end:4px',
  'border:0', 'border-radius:50%', 'background:transparent', 'cursor:pointer',
  'color:var(--tempo-colors-icon-neutral-primary-default, currentColor)',
].join(';');

/**
 * Puts a gear button in Deezer's top bar, just before the notifications bell. Optional: the shortcut and the
 * tray still open the settings if Deezer's DOM changes and the button cannot be placed.
 */
export function startGearButton(open: () => void, label: string) {
  const ensure = () => {
    const topbar = document.querySelector('.page-topbar');
    if (!topbar || topbar.querySelector('.breezr-gear')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'breezr-gear';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.style.cssText = BUTTON_STYLE;
    button.innerHTML = GEAR_SVG;
    button.addEventListener('mouseenter', () => {
      button.style.background = 'var(--tempo-colors-background-neutral-tertiary-hovered, rgb(255 255 255 / 0.1))';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
    });
    button.addEventListener('click', open);
    const bell = topbar.querySelector('.topbar-action');
    if (bell?.parentElement === topbar) topbar.insertBefore(button, bell);
    else topbar.append(button);
  };
  ensure();
  // Deezer re-renders its top bar on some navigations; re-attach when needed. Cheap: one query per second.
  setInterval(ensure, 1000);
}
