import { h } from './dom';
import type { ModalContext } from './modal';
import { normalizeHex } from '../../shared/color';
import { SOURCE_KINDS, type SourceKind } from '../../shared/palette';
import {
  BUILTIN_PRESETS, CONTRAST_ACCENT_MIN, CONTRAST_TEXT_MIN, MANAGED_VARS, buildThemeVars, effectiveLook, themeContrast,
  type Base, type Derivation, type ThemeColors, type ThemeConfig,
} from '../../shared/theme-model';
import { applyPreset, deletePreset, resetOverride, savePreset, setColor, setOverride } from '../../shared/theme-edit';

// Survives re-renders while the modal stays open.
let advancedOpen = false;
let selectedPresetId = 'deezer';

export function renderAppearance(ctx: ModalContext): HTMLElement {
  const { t } = ctx;
  const theme = () => ctx.draft.theme;
  const setTheme = (next: ThemeConfig, rerender = true) => ctx.update({ ...ctx.draft, theme: next }, { rerender });
  // The source's palette only counts when the draft actually uses a source.
  const palette = () => (theme().enabled && theme().source !== 'manual' ? ctx.source().palette : null);
  const vars = () => buildThemeVars(theme(), palette());
  const isFocused = (el: HTMLElement) => el === (el.getRootNode() as Document | ShadowRoot).activeElement;

  // --- Live elements: refreshed without a re-render (colour dragging, source updates) ---
  const contrast = h('p', { class: 'warning', role: 'status' });
  const status = h('p', { class: 'hint', role: 'status' });
  const varRows = new Map<string, { swatch: HTMLElement; picker: HTMLInputElement }>();
  const baseFields = new Map<keyof ThemeColors, { picker: HTMLInputElement; text: HTMLInputElement }>();

  const statusText = (): string => {
    const { status: s } = ctx.source();
    const time = s.updatedAt
      ? new Intl.DateTimeFormat(ctx.snapshot.locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(s.updatedAt))
      : '';
    switch (s.state) {
      case 'ok':
        return theme().source === 'system'
          ? t('settings.appearance.source.status.systemOk', { time })
          : t('settings.appearance.source.status.ok', { file: s.displayPath ?? '', time });
      case 'missing':
        return t(s.kept ? 'settings.appearance.source.status.missingKept' : 'settings.appearance.source.status.missing');
      case 'invalid':
        return t('settings.appearance.source.status.invalid');
      default:
        return t('settings.appearance.source.status.unavailable');
    }
  };

  const refreshLive = () => {
    const current = vars();
    const ratios = themeContrast(current);
    const fromSource = palette() !== null;
    const messages: string[] = [];
    if (ratios.text < CONTRAST_TEXT_MIN) {
      messages.push(t(fromSource ? 'settings.appearance.contrastSource' : 'settings.appearance.contrastWarning', { ratio: ratios.text.toFixed(1) }));
    }
    if (ratios.accent < CONTRAST_ACCENT_MIN) messages.push(t('settings.appearance.contrastAccent', { ratio: ratios.accent.toFixed(1) }));
    contrast.textContent = messages.join(' ');
    const backdrop = (contrast.getRootNode() as ShadowRoot | Document).querySelector?.('.backdrop');
    backdrop?.classList.toggle('safe-colors', ratios.text < CONTRAST_TEXT_MIN);
    status.textContent = theme().enabled && theme().source !== 'manual' ? statusText() : '';
    const look = effectiveLook(theme(), palette());
    for (const [key, field] of baseFields) {
      // Colours provided by the source are shown as received; never fight a field being edited.
      if (field.picker.disabled && !isFocused(field.picker)) field.picker.value = look.colors[key];
      if (field.text.disabled && !isFocused(field.text)) field.text.value = look.colors[key];
    }
    for (const [name, row] of varRows) {
      const value = current[name as keyof typeof current];
      row.swatch.style.background = value;
      if (!isFocused(row.picker)) row.picker.value = value;
    }
  };
  ctx.onSourceRefresh(refreshLive);

  const provided = palette()?.colors ?? {};
  const colorField = (key: keyof ThemeColors) => {
    const id = `color-${key}`;
    const fromSource = provided[key] !== undefined;
    const shown = effectiveLook(theme(), palette()).colors[key];
    const error = h('span', { class: 'warning' });
    const picker = h('input', { type: 'color', id, value: shown, disabled: fromSource, 'data-focus-id': id });
    // dir=ltr: in Arabic the bidi algorithm would otherwise render "#ff2bd6" as "ff2bd6#".
    const text = h('input', { type: 'text', class: 'hex', dir: 'ltr', value: shown, disabled: fromSource, 'aria-label': t(`settings.appearance.color.${key}`), 'data-focus-id': `${id}-hex` });
    // Hex codes are not words: no red spell-check squiggles.
    text.spellcheck = false;
    baseFields.set(key, { picker, text });
    picker.addEventListener('input', () => {
      text.value = picker.value;
      text.removeAttribute('aria-invalid');
      error.textContent = '';
      setTheme(setColor(theme(), key, picker.value), false);
      refreshLive();
    });
    // The native picker closed (or the value was committed): no need to wait for the debounce.
    picker.addEventListener('change', () => ctx.flushPreview());
    text.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') ctx.flushPreview();
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

  const select = <T extends string>(id: string, value: T, options: [T, string][], onChange: (v: T) => void, disabled = false) => {
    const el = h('select', { id, disabled, 'data-focus-id': id }, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    el.addEventListener('change', () => onChange(el.value as T));
    return el;
  };

  // --- Enable switch (outside the disabled fieldset) ---
  const enabled = h('input', { type: 'checkbox', id: 'theme-enabled', checked: theme().enabled, 'data-focus-id': 'theme-enabled' });
  enabled.addEventListener('change', () => setTheme({ ...theme(), enabled: enabled.checked }));

  // --- Colour source ---
  const source = theme().source;
  const sourceSelect = select<SourceKind>('theme-source', source,
    SOURCE_KINDS.map((kind) => [kind, t(`settings.appearance.source.${kind}`)]),
    (kind) => setTheme({ ...theme(), source: kind }));
  const pathRow = (kind: 'caelestia' | 'pywal') => {
    const input = h('input', {
      type: 'text', id: 'source-path', dir: 'ltr', value: theme().sourcePaths[kind],
      placeholder: t('settings.appearance.source.pathDefault', { path: ctx.snapshot.defaultPaths[kind] }),
      'data-focus-id': 'source-path',
    });
    input.spellcheck = false;
    input.style.minInlineSize = '32ch';
    // Committed on change (blur / Enter), not on each keystroke: every new path means a new file read.
    input.addEventListener('change', () => setTheme({ ...theme(), sourcePaths: { ...theme().sourcePaths, [kind]: input.value.trim() } }));
    return h('div', { class: 'row' }, h('label', { for: 'source-path' }, t('settings.appearance.source.path')), input);
  };
  const sourceBlock = h('fieldset', {},
    h('div', { class: 'row' }, h('label', { for: 'theme-source' }, t('settings.appearance.source')), sourceSelect),
    source === 'caelestia' || source === 'pywal' ? pathRow(source) : null,
    status);


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
  // A preset is a manual palette: Breezr never switches the source back to Manual on the user's behalf.
  const presetsBlocked = source !== 'manual';
  const presetName = h('input', { type: 'text', placeholder: t('settings.appearance.presets.namePlaceholder'), 'data-focus-id': 'preset-name' });
  const saveAs = h('button', { type: 'button', 'data-focus-id': 'preset-save' }, t('settings.appearance.presets.saveAs'));
  saveAs.addEventListener('click', () => {
    const next = savePreset(theme(), presetName.value, Date.now(), palette());
    if (next === theme()) return;
    selectedPresetId = next.presets[next.presets.length - 1].id;
    setTheme(next);
  });

  // --- Advanced ---
  const derived = buildThemeVars({ ...theme(), overrides: {} }, palette());
  const effective = vars();
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

  const look = effectiveLook(theme(), palette());
  const fields = h('fieldset', { disabled: !theme().enabled },
    sourceBlock,
    h('div', { class: 'row' },
      h('label', { for: 'theme-base' }, t('settings.appearance.base')),
      select<Base>('theme-base', look.base, [['dark', t('settings.appearance.base.dark')], ['light', t('settings.appearance.base.light')]],
        (base) => setTheme({ ...theme(), base }), palette()?.base !== undefined)),
    h('fieldset', {},
      h('legend', {}, t('settings.appearance.colors')),
      colorField('accent'), colorField('background'), colorField('text'),
      contrast),
    h('div', { class: 'row' },
      h('label', { for: 'theme-derivation' }, t('settings.appearance.derivation')),
      select<Derivation>('theme-derivation', theme().derivation,
        [['mix', t('settings.appearance.derivation.mix')], ['hsl', t('settings.appearance.derivation.hsl')]],
        (derivation) => setTheme({ ...theme(), derivation }), palette()?.ladder !== undefined)),
    h('p', { class: 'hint' }, t('settings.appearance.derivation.help')),
    h('fieldset', {},
      h('legend', {}, t('settings.appearance.presets')),
      h('div', { class: 'row' },
        presetSelect,
        h('button', {
          type: 'button', 'data-focus-id': 'preset-apply', disabled: presetsBlocked,
          onclick: () => { if (selected && !presetsBlocked) setTheme(applyPreset(theme(), selected)); },
        }, t('settings.appearance.presets.apply')),
        h('button', {
          type: 'button', 'data-focus-id': 'preset-delete', disabled: !selected || selected.builtin === true,
          onclick: () => { if (selected && !selected.builtin) { selectedPresetId = 'deezer'; setTheme(deletePreset(theme(), selected.id)); } },
        }, t('settings.appearance.presets.delete'))),
      presetsBlocked ? h('p', { class: 'hint' }, t('settings.appearance.presets.disabledBySource')) : null,
      h('div', { class: 'row' }, presetName, saveAs)),
    advanced,
  );

  const section = h('div', {},
    h('div', { class: 'row' }, h('label', { for: 'theme-enabled' }, t('settings.appearance.enabled')), enabled),
    h('p', { class: 'hint' }, t('settings.appearance.enabledHelp')),
    theme().enabled ? null : h('p', { class: 'hint' }, t('settings.appearance.source.disabledHint')),
    fields);
  refreshLive();
  return section;
}
