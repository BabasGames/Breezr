import { h } from './dom';
import type { ModalContext } from './modal';
import { createUi } from './ui';
import { feedbackUrl, REPO_URL } from '../../shared/feedback';

export function renderAbout(ctx: ModalContext): HTMLElement {
  const { t } = ctx;
  const { section } = createUi(t);
  const version = ctx.snapshot.version;
  // target=_blank goes through the main process window-open handler, which opens the system browser.
  const link = (href: string, label: string, cls?: string) => h('a', { href, target: '_blank', rel: 'noreferrer', class: cls }, label);
  return h('div', { class: 'about' },
    h('div', { class: 'about-head' },
      h('strong', {}, 'Breezr'),
      h('span', { class: 'auto' }, t('settings.about.version', { version }))),
    h('p', {}, t('settings.about.description')),
    section(t('settings.about.feedback'),
      h('p', {}, t('settings.about.feedbackText')),
      h('div', { class: 'links' },
        link(feedbackUrl('idea', version), t('settings.about.suggestIdea'), 'button primary'),
        link(feedbackUrl('bug', version), t('settings.about.reportBug'), 'button'))),
    h('div', { class: 'small' },
      h('span', {}, t('settings.about.source'), ' · ', link(REPO_URL, REPO_URL.replace('https://', ''))),
      link('https://github.com/CuteTenshii/deezer-discord-rpc', t('settings.about.upstream')),
      h('span', {}, t('settings.about.license')),
      h('span', {}, t('settings.about.translations'))),
  );
}
