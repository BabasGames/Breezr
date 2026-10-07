import { h } from './dom';
import type { ModalContext } from './modal';
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

  const closeToTray = h('input', { type: 'checkbox', id: 'dont-close', checked: ctx.draft.dont_close_to_tray, 'data-focus-id': 'dont-close' });
  closeToTray.addEventListener('change', () => set({ dont_close_to_tray: closeToTray.checked }));

  const animateSidebar = h('input', { type: 'checkbox', id: 'animate-sidebar', checked: ctx.draft.animate_sidebar, 'data-focus-id': 'animate-sidebar' });
  animateSidebar.addEventListener('change', () => set({ animate_sidebar: animateSidebar.checked }));

  return h('div', {},
    h('fieldset', {},
      h('div', { class: 'row' },
        h('label', { for: 'language' }, t('settings.general.language')),
        select('language', ctx.draft.language, languageOptions, (language) => set({ language }))),
      h('p', { class: 'hint' }, t('settings.general.languageHelp'))),
    h('fieldset', {},
      h('div', { class: 'row' },
        h('label', { for: 'status-name' }, t('tray.statusName')),
        select<StatusName>('status-name', ctx.draft.status_name, STATUS_NAMES.map((id) => [id, t(`option.statusName.${id}`)]),
          (status_name) => set({ status_name }))),
      h('div', { class: 'row' },
        h('label', { for: 'tooltip-text' }, t('tray.tooltipText')),
        select<TooltipText>('tooltip-text', ctx.draft.tooltip_text, TOOLTIP_TEXTS.map((id) => [id, t(`option.tooltip.${id}`)]),
          (tooltip_text) => set({ tooltip_text }))),
      h('div', { class: 'row' }, h('label', { for: 'dont-close' }, t('tray.dontCloseToTray')), closeToTray)),
    h('fieldset', {},
      h('div', { class: 'row' }, h('label', { for: 'animate-sidebar' }, t('settings.general.animateSidebar')), animateSidebar),
      h('p', { class: 'hint' }, t('settings.general.animateSidebarHelp'))),
  );
}
