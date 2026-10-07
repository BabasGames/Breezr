/** Adds a ⚙ button next to the ← → buttons. Optional: the shortcut and the tray still work if Deezer's DOM changes. */
export function startGearButton(open: () => void, label: string) {
  const ensure = () => {
    const nav = document.getElementById('breezr-nav');
    if (!nav || nav.querySelector('.breezr-gear')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'breezr-gear';
    button.textContent = '⚙';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.style.cssText = 'font-size:18px;opacity:.8;background:none;border:0;color:inherit;cursor:pointer';
    button.addEventListener('click', open);
    nav.append(button);
  };
  ensure();
  // Deezer re-renders its header; re-attach when needed. Cheap: one getElementById per second.
  setInterval(ensure, 1000);
}
