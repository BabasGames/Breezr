import { h } from './dom';
import { STYLES } from './styles';
import { bridge } from './bridge';
import { createTranslator, type Translate } from '../../shared/i18n';
import type { BreezrConfig } from '../../shared/config-schema';
import type { SettingsSnapshot } from '../../shared/settings-types';
import { renderAppearance } from './tab-appearance';

type TabId = 'appearance' | 'general' | 'about';

export interface ModalContext {
  draft: BreezrConfig;
  snapshot: SettingsSnapshot;
  t: Translate;
  /** Replaces the draft, previews its theme, and re-renders unless `rerender` is false (live color dragging). */
  update(next: BreezrConfig, options?: { rerender?: boolean }): void;
}

type TabRenderer = (ctx: ModalContext) => HTMLElement;
const TABS: Record<TabId, TabRenderer> = {
  appearance: renderAppearance,
  general: () => h('div'),   // Task 13
  about: () => h('div'),     // Task 13
};

const FOCUSABLE = 'button, input, select, summary, a[href], [tabindex]:not([tabindex="-1"])';

export function createModal(host: HTMLElement) {
  const root = host.attachShadow({ mode: 'closed' });
  root.append(h('style', {}, STYLES));

  let snapshot: SettingsSnapshot | null = null;
  let draft: BreezrConfig | null = null;
  let tab: TabId = 'appearance';
  let container: HTMLElement | null = null;
  let previewFrame = 0;
  let returnFocus: HTMLElement | null = null;

  const schedulePreview = () => {
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      if (draft) bridge().settings.preview(draft.theme);
    });
  };

  const close = () => {
    container?.remove();
    container = null;
    snapshot = null;
    draft = null;
    returnFocus?.focus?.();
  };

  const cancel = () => {
    cancelAnimationFrame(previewFrame);
    bridge().settings.cancel();
    close();
  };

  const save = async () => {
    if (!draft) return;
    cancelAnimationFrame(previewFrame);
    await bridge().settings.save(draft);
    close();
  };

  function render() {
    if (!snapshot || !draft) return;
    const focusId = (root.activeElement as HTMLElement | null)?.dataset?.focusId;
    const t = createTranslator(snapshot.locale, snapshot.messages, snapshot.fallback);
    const ctx: ModalContext = {
      draft,
      snapshot,
      t,
      update(next, options) {
        draft = next;
        ctx.draft = next;
        schedulePreview();
        if (options?.rerender !== false) render();
      },
    };
    const tabs: [TabId, string][] = [
      ['appearance', t('settings.tabs.appearance')],
      ['general', t('settings.tabs.general')],
      ['about', t('settings.tabs.about')],
    ];
    const panel = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'breezr-title', dir: snapshot.dir, lang: snapshot.locale },
      h('header', { id: 'breezr-title' }, t('settings.title')),
      h('nav', { role: 'tablist', 'aria-orientation': 'vertical' },
        ...tabs.map(([id, label]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(id === tab), 'data-focus-id': `tab-${id}`,
          onclick: () => { tab = id; render(); },
        }, label))),
      h('main', { role: 'tabpanel' }, TABS[tab](ctx)),
      h('footer', {},
        h('button', { type: 'button', onclick: cancel }, t('settings.cancel')),
        h('button', { type: 'button', class: 'primary', onclick: () => { void save(); } }, t('settings.save'))),
    );
    const backdrop = h('div', { class: 'backdrop' }, panel);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) cancel();
    });
    container?.remove();
    container = backdrop;
    root.append(backdrop);
    const target = focusId ? root.querySelector<HTMLElement>(`[data-focus-id="${focusId}"]`) : null;
    (target ?? root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]'))?.focus();
  }

  root.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent;
    if (!container) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && root.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && root.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    async open() {
      if (container) return;
      returnFocus = document.activeElement as HTMLElement | null;
      snapshot = await bridge().settings.get();
      draft = structuredClone(snapshot.config);
      tab = 'appearance';
      render();
    },
    isOpen: () => container !== null,
    cancel() {
      if (container) cancel();
    },
    focusFirst() {
      root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    },
  };
}
