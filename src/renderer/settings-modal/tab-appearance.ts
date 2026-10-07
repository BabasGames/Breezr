import { h } from './dom';
import type { ModalContext } from './modal';
import { contrastRatio, normalizeHex } from '../../shared/color';
import {
  BUILTIN_PRESETS, MANAGED_VARS, buildThemeVars, type Base, type Derivation, type ThemeColors, type ThemeConfig,
} from '../../shared/theme-model';
import { applyPreset, deletePreset, resetOverride, savePreset, setColor, setOverride } from '../../shared/theme-edit';

// Survives re-renders while the modal stays open.
let advancedOpen = false;
let selectedPresetId = 'deezer';

export function renderAppearance(ctx: ModalContext): HTMLElement {
  const { t } = ctx;
  const theme = () => ctx.draft.theme;
  const setTheme = (next: ThemeConfig, rerender = true) => ctx.update({ ...ctx.draft, theme: next }, { rerender });

  // Live elements refreshed without a re-render while a color picker is being dragged.
  const contrast = h('p', { class: 'warning', role: 'status' });
  const varRows = new Map<string, { swatch: HTMLElement; picker: HTMLInputElement }>();
  const refreshLive = () => {
    const vars = buildThemeVars(theme());
    const ratio = contrastRatio(vars['--color-text-main'], vars['--color-bg-main']);
    contrast.textContent = ratio < 4.5 ? t('settings.appearance.contrastWarning', { ratio: ratio.toFixed(1) }) : '';
    for (const [name, row] of varRows) {
      const value = vars[name as keyof typeof vars];
      row.swatch.style.background = value;
      // Don't fight the user while they drag this very picker.
      if (row.picker !== (row.picker.getRootNode() as Document | ShadowRoot).activeElement) row.picker.value = value;
    }
  };

  const colorField = (key: keyof ThemeColors) => {
    const id = `color-${key}`;
    const error = h('span', { class: 'warning' });
    const picker = h('input', { type: 'color', id, value: theme().colors[key], 'data-focus-id': id });
    // dir=ltr: in Arabic the bidi algorithm would otherwise render "#ff2bd6" as "ff2bd6#".
    const text = h('input', { type: 'text', class: 'hex', dir: 'ltr', value: theme().colors[key], 'aria-label': t(`settings.appearance.color.${key}`), 'data-focus-id': `${id}-hex` });
    // Hex codes are not words: no red spell-check squiggles.
    text.spellcheck = false;
    picker.addEventListener('input', () => {
      text.value = picker.value;
      text.removeAttribute('aria-invalid');
      error.textContent = '';
      setTheme(setColor(theme(), key, picker.value), false);
      refreshLive();
    });
    text.addEventListener('input', () => {
      const hex = normalizeHex(text.value);
      if (!hex) {
        text.setAttribute('aria-invalid', 'true');
        error.textContent = t('settings.appearance.invalidHex');
        return;
      }
      text.removeAttribute('aria-invalid');
      error.textContent = '';
      picker.value = hex;
      setTheme(setColor(theme(), key, hex), false);
      refreshLive();
    });
    return h('div', { class: 'row' }, h('label', { for: id }, t(`settings.appearance.color.${key}`)), picker, text, error);
  };

  const select = <T extends string>(id: string, value: T, options: [T, string][], onChange: (v: T) => void) => {
    const el = h('select', { id, 'data-focus-id': id }, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    el.addEventListener('change', () => onChange(el.value as T));
    return el;
  };

  // --- Enable switch (outside the disabled fieldset) ---
  const enabled = h('input', { type: 'checkbox', id: 'theme-enabled', checked: theme().enabled, 'data-focus-id': 'theme-enabled' });
  enabled.addEventListener('change', () => setTheme({ ...theme(), enabled: enabled.checked }));

  // --- Presets ---
  const allPresets = [
    ...BUILTIN_PRESETS.map((p) => ({ preset: p, label: t(`settings.appearance.presets.builtin.${p.id}`) })),
    ...theme().presets.map((p) => ({ preset: p, label: p.name })),
  ];
  if (!allPresets.some(({ preset }) => preset.id === selectedPresetId)) selectedPresetId = 'deezer';
  const presetSelect = select('preset', selectedPresetId, allPresets.map(({ preset, label }) => [preset.id, label]), (id) => {
    selectedPresetId = id;
    ctx.update(ctx.draft);
  });
  const selected = allPresets.find(({ preset }) => preset.id === selectedPresetId)?.preset;
  const presetName = h('input', { type: 'text', placeholder: t('settings.appearance.presets.namePlaceholder'), 'data-focus-id': 'preset-name' });
  const saveAs = h('button', { type: 'button', 'data-focus-id': 'preset-save' }, t('settings.appearance.presets.saveAs'));
  saveAs.addEventListener('click', () => {
    const next = savePreset(theme(), presetName.value);
    if (next === theme()) return;
    selectedPresetId = next.presets[next.presets.length - 1].id;
    setTheme(next);
  });

  // --- Advanced ---
  const derived = buildThemeVars({ ...theme(), overrides: {} });
  const effective = buildThemeVars(theme());
  const overriddenCount = Object.keys(theme().overrides).length;
  const advanced = h('details', { open: advancedOpen },
    h('summary', { 'data-focus-id': 'advanced' },
      t('settings.appearance.advanced'),
      overriddenCount > 0 ? ` — ${t('settings.appearance.advanced.overridden', { count: overriddenCount })}` : ''),
    h('p', { class: 'hint' }, t('settings.appearance.advanced.help')),
    ...MANAGED_VARS.map((name) => {
      const overridden = name in theme().overrides;
      const swatch = h('span', { class: 'swatch' });
      swatch.style.background = effective[name];
      const picker = h('input', { type: 'color', value: effective[name], 'aria-label': name, 'data-focus-id': `var-${name}` });
      picker.addEventListener('input', () => {
        setTheme(setOverride(theme(), name, picker.value), false);
        swatch.style.background = picker.value;
      });
      picker.addEventListener('change', () => ctx.update(ctx.draft));
      varRows.set(name, { swatch, picker });
      return h('div', { class: 'row var-row' },
        h('code', { title: name, dir: 'ltr' }, name.replace('--tempo-colors-', '')),
        swatch,
        picker,
        overridden
          ? h('button', { type: 'button', title: t('settings.appearance.advanced.reset'), 'aria-label': t('settings.appearance.advanced.reset'), onclick: () => setTheme(resetOverride(theme(), name)) }, '↺')
          : h('span', { class: 'auto' }, `${t('settings.appearance.advanced.auto')} · ${derived[name]}`));
    }));
  advanced.addEventListener('toggle', () => { advancedOpen = advanced.open; });

  const fields = h('fieldset', { disabled: !theme().enabled },
    h('div', { class: 'row' },
      h('label', { for: 'theme-base' }, t('settings.appearance.base')),
      select<Base>('theme-base', theme().base, [['dark', t('settings.appearance.base.dark')], ['light', t('settings.appearance.base.light')]],
        (base) => setTheme({ ...theme(), base }))),
    h('fieldset', {},
      h('legend', {}, t('settings.appearance.colors')),
      colorField('accent'), colorField('background'), colorField('text'),
      contrast),
    h('div', { class: 'row' },
      h('label', { for: 'theme-derivation' }, t('settings.appearance.derivation')),
      select<Derivation>('theme-derivation', theme().derivation,
        [['mix', t('settings.appearance.derivation.mix')], ['hsl', t('settings.appearance.derivation.hsl')]],
        (derivation) => setTheme({ ...theme(), derivation }))),
    h('p', { class: 'hint' }, t('settings.appearance.derivation.help')),
    h('fieldset', {},
      h('legend', {}, t('settings.appearance.presets')),
      h('div', { class: 'row' },
        presetSelect,
        h('button', { type: 'button', 'data-focus-id': 'preset-apply', onclick: () => { if (selected) setTheme(applyPreset(theme(), selected)); } }, t('settings.appearance.presets.apply')),
        h('button', {
          type: 'button', 'data-focus-id': 'preset-delete', disabled: !selected || selected.builtin === true,
          onclick: () => { if (selected && !selected.builtin) { selectedPresetId = 'deezer'; setTheme(deletePreset(theme(), selected.id)); } },
        }, t('settings.appearance.presets.delete'))),
      h('div', { class: 'row' }, presetName, saveAs)),
    advanced,
  );

  const section = h('div', {},
    h('div', { class: 'row' }, h('label', { for: 'theme-enabled' }, t('settings.appearance.enabled')), enabled),
    h('p', { class: 'hint' }, t('settings.appearance.enabledHelp')),
    fields);
  refreshLive();
  return section;
}
