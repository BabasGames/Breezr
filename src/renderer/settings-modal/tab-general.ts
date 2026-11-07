import { h } from './dom';
import type { ModalContext } from './modal';
import { createUi } from './ui';
import { bridge } from './bridge';
import { LANGUAGE_NAMES, LOCALES } from '../../shared/i18n';
import { STATUS_NAMES, TOOLTIP_TEXTS, type BreezrConfig, type StatusName, type TooltipText } from '../../shared/config-schema';

export function renderGeneral(ctx: ModalContext): HTMLElement {
  const { t } = ctx;
  const set = (patch: Partial<BreezrConfig>) => ctx.update({ ...ctx.draft, ...patch });

  const select = <T extends string>(id: string, value: T, options: [T, string][], onChange: (v: T) => void) => {
    const el = h('select', { id, 'data-focus-id': id }, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    el.addEventListener('change', () => onChange(el.value as T));
    return el;
  };

  const languageOptions: [BreezrConfig['language'], string][] = [
    ['auto', t('settings.general.language.auto')],
    ...LOCALES.map((code): [BreezrConfig['language'], string] => [code, LANGUAGE_NAMES[code]]),
  ];

  const { section, setting, toggle } = createUi(t);

  const liveDiscord = toggle('live-link-discord', ctx.draft.live_link_discord, (live_link_discord) => set({ live_link_discord }));
  liveDiscord.disabled = !ctx.snapshot.liveUrl;

  const liveUrlRow = (url: string) => {
    // dir=ltr: a URL reads left to right even in Arabic.
    const field = h('input', { type: 'text', class: 'url', readOnly: true, value: url, dir: 'ltr', 'aria-label': t('settings.general.liveLink'), 'data-focus-id': 'live-url' });
    field.spellcheck = false;
    const copy = h('button', { type: 'button', 'data-focus-id': 'live-copy' }, t('settings.general.liveLinkCopy'));
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(url).then(() => {
        copy.textContent = t('settings.general.liveLinkCopied');
        setTimeout(() => { copy.textContent = t('settings.general.liveLinkCopy'); }, 2000);
      });
    });
    const renew = h('button', { type: 'button', 'data-focus-id': 'live-renew' }, t('settings.general.liveLinkRenew'));
    renew.addEventListener('click', () => {
      void bridge().live.renew().then(({ url: next }) => {
        ctx.snapshot.liveUrl = next;
        ctx.update(ctx.draft);
      });
    });
    return h('div', { class: 'setting url-row' }, field, h('div', { class: 'setting-control' }, copy, renew));
  };

  /** "3 people are following your link right now", refreshed while the settings stay open. */
  const viewersLine = () => {
    const line = h('p', { class: 'status viewers', role: 'status' });
    const refresh = () => {
      if (!line.isConnected && line.dataset.started) return clearInterval(timer);
      line.dataset.started = '1';
      void bridge().live.viewers().then(({ viewers }) => {
        line.textContent = viewers === null ? '' : viewers === 0 ? t('settings.general.liveViewersNone') : t('settings.general.liveViewers', { count: viewers });
      }).catch(() => undefined);
    };
    const timer = setInterval(refresh, 30_000);
    refresh();
    return line;
  };

  return h('div', {},
    section(t('settings.general.section.interface'),
      setting({ label: t('settings.general.language'), id: 'language', help: t('settings.general.languageHelp') },
        select('language', ctx.draft.language, languageOptions, (language) => set({ language }))),
      setting({ label: t('settings.general.animateSidebar'), id: 'animate-sidebar', help: t('settings.general.animateSidebarHelp') },
        toggle('animate-sidebar', ctx.draft.animate_sidebar, (animate_sidebar) => set({ animate_sidebar })))),
    section(t('settings.general.section.discord'),
      setting({ label: t('tray.statusName'), id: 'status-name', help: t('settings.general.statusNameHelp') },
        select<StatusName>('status-name', ctx.draft.status_name, STATUS_NAMES.map((id) => [id, t(`option.statusName.${id}`)]),
          (status_name) => set({ status_name })))),
    section(t('settings.general.section.share'),
      setting({ label: t('settings.general.liveLink'), id: 'live-link', help: t('settings.general.liveLinkHelp') },
        toggle('live-link', ctx.draft.live_link && ctx.snapshot.liveUrl !== null, (on) => {
          void bridge().live.set(on).then(({ url }) => {
            ctx.snapshot.liveUrl = url;
            set({ live_link: on });
          });
        })),
      ctx.snapshot.liveUrl ? liveUrlRow(ctx.snapshot.liveUrl) : null,
      ctx.snapshot.liveUrl ? viewersLine() : null,
      setting({ label: t('settings.general.liveLinkDiscord'), id: 'live-link-discord', help: t('settings.general.liveLinkDiscordHelp') },
        liveDiscord)),
    section(t('settings.general.section.tray'),
      setting({ label: t('tray.tooltipText'), id: 'tooltip-text', help: t('settings.general.tooltipTextHelp') },
        select<TooltipText>('tooltip-text', ctx.draft.tooltip_text, TOOLTIP_TEXTS.map((id) => [id, t(`option.tooltip.${id}`)]),
          (tooltip_text) => set({ tooltip_text }))),
      setting({ label: t('tray.dontCloseToTray'), id: 'dont-close', help: t('settings.general.dontCloseToTrayHelp') },
        toggle('dont-close', ctx.draft.dont_close_to_tray, (dont_close_to_tray) => set({ dont_close_to_tray })))),
  );
}
