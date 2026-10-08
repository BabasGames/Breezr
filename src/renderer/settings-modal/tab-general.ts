import { h } from './dom';
import type { ModalContext } from './modal';
import { createUi } from './ui';
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
    section(t('settings.general.section.tray'),
      setting({ label: t('tray.tooltipText'), id: 'tooltip-text', help: t('settings.general.tooltipTextHelp') },
        select<TooltipText>('tooltip-text', ctx.draft.tooltip_text, TOOLTIP_TEXTS.map((id) => [id, t(`option.tooltip.${id}`)]),
          (tooltip_text) => set({ tooltip_text }))),
      setting({ label: t('tray.dontCloseToTray'), id: 'dont-close', help: t('settings.general.dontCloseToTrayHelp') },
        toggle('dont-close', ctx.draft.dont_close_to_tray, (dont_close_to_tray) => set({ dont_close_to_tray })))),
  );
}
