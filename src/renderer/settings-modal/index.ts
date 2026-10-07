import { bridge } from './bridge';
import { createModal } from './modal';
import { createTranslator } from '../../shared/i18n';
import { startGearButton } from './gear-button';

(() => {
  // The bundle is injected on every dom-ready; a reload starts from a fresh document, an SPA navigation does not.
  if (document.getElementById('breezr-settings-host')) return;
  const host = document.createElement('div');
  host.id = 'breezr-settings-host';
  document.body.append(host);
  const modal = createModal(host);

  // Keep Deezer's own shortcuts (space = play/pause…) from firing while typing in the modal.
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    host.addEventListener(type, (event) => {
      if (modal.isOpen()) event.stopPropagation();
    });
  }

  // Focus can leave the modal (a click on a disabled field or on the panel background lands on <body>).
  // Keys typed then must not reach Deezer's shortcuts either: Escape still cancels, Tab brings focus back.
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    window.addEventListener(type, (event) => {
      if (!modal.isOpen() || event.composedPath().includes(host)) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if (type !== 'keydown') return;
      if (event.key === 'Escape') modal.cancel();
      else if (event.key === 'Tab') modal.focusFirst();
    }, true);
  }

  bridge().settings.onOpen(() => {
    void modal.open();
  });

  void bridge().settings.get().then((snapshot) => {
    const t = createTranslator(snapshot.locale, snapshot.messages, snapshot.fallback);
    startGearButton(() => { void modal.open(); }, t('settings.openButton'));
  });
})();
