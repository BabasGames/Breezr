import { h } from './dom';
import type { ModalContext } from './modal';

export function renderAbout(ctx: ModalContext): HTMLElement {
  const { t } = ctx;
  // target=_blank goes through the main process window-open handler, which opens the system browser.
  const link = (href: string, label: string) => h('a', { href, target: '_blank', rel: 'noreferrer' }, label);
  return h('div', {},
    h('p', {}, h('strong', {}, 'Breezr'), ' — ', t('settings.about.version', { version: ctx.snapshot.version })),
    h('p', {}, t('settings.about.description')),
    h('p', {}, link('https://github.com/BabasGames/Breezr', t('settings.about.source'))),
    h('p', {}, link('https://github.com/CuteTenshii/deezer-discord-rpc', t('settings.about.upstream'))),
    h('p', {}, t('settings.about.license')),
    h('p', { class: 'hint' }, t('settings.about.translations')),
  );
}
