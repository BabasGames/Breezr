import { h } from './dom';
import { STYLES } from './styles';
import { bridge } from './bridge';
import { createTranslator, type Translate } from '../../shared/i18n';
import type { BreezrConfig } from '../../shared/config-schema';
import type { SettingsSnapshot, SourceMessage } from '../../shared/settings-types';
import type { ExternalPalette } from '../../shared/palette';
import { renderAppearance } from './tab-appearance';
import { renderAbout } from './tab-about';
import { renderGeneral } from './tab-general';
import { createDebouncer, PREVIEW_DEBOUNCE_MS } from '../../shared/debounce';

type TabId = 'appearance' | 'general' | 'about';

export interface ModalContext {
  draft: BreezrConfig;
  snapshot: SettingsSnapshot;
  t: Translate;
  /**
   * Replaces the draft and previews its theme. With `rerender: false` (a colour being dragged or typed) the
   * preview waits until the value has been stable for PREVIEW_DEBOUNCE_MS; otherwise it is sent at once and
   * the tab is re-rendered.
   */
  update(next: BreezrConfig, options?: { rerender?: boolean }): void;
  /** Sends a pending (debounced) preview now — e.g. when a colour picker closes. */
  flushPreview(): void;
  /** Palette and status of the source the page currently shows (saved or previewed). */
  source(): SourceMessage;
  /** The tab's light refresh, called when the source sends new colours (no DOM rebuild, focus untouched). */
  onSourceRefresh(refresh: () => void): void;
}

type TabRenderer = (ctx: ModalContext) => HTMLElement;
const TABS: Record<TabId, TabRenderer> = {
  appearance: renderAppearance,
  general: renderGeneral,
  about: renderAbout,
};

const FOCUSABLE = 'button, input, select, summary, a[href], [tabindex]:not([tabindex="-1"])';

export function createModal(host: HTMLElement) {
  const root = host.attachShadow({ mode: 'closed' });
  root.append(h('style', {}, STYLES));

  let snapshot: SettingsSnapshot | null = null;
  let draft: BreezrConfig | null = null;
  let tab: TabId = 'appearance';
  let container: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;
  let sourceMessage: SourceMessage | null = null;
  let sourceRefresh: (() => void) | null = null;

  // Which fields a palette provides: when that set changes, greyed/enabled controls change too → full render.
  const provides = (palette: ExternalPalette | null) =>
    palette ? [...Object.keys(palette.colors).sort(), palette.base ? 'base' : '', palette.ladder ? 'ladder' : ''].join(',') : '';

  bridge().settings.onSource((update) => {
    if (!container) return;
    const before = provides(sourceMessage?.palette ?? null);
    sourceMessage = update;
    if (sourceRefresh && provides(update.palette) === before) sourceRefresh();
    else render();
  });

  // Every preview re-injects the theme into the whole Deezer page; doing it on each mouse move while a
  // colour picker is dragged made the page stutter. Continuous edits wait until the value is stable.
  const sendPreview = () => {
    if (draft) bridge().settings.preview(draft.theme);
  };
  const previewDebouncer = createDebouncer(sendPreview, PREVIEW_DEBOUNCE_MS);
  const previewNow = () => {
    previewDebouncer.cancel();
    sendPreview();
  };

  const close = () => {
    container?.remove();
    container = null;
    sourceMessage = null;
    sourceRefresh = null;
    snapshot = null;
    draft = null;
    returnFocus?.focus?.();
  };

  const cancel = () => {
    previewDebouncer.cancel();
    bridge().settings.cancel();
    close();
  };

  const save = async () => {
    if (!draft) return;
    // Save applies the draft itself; a pending preview would only apply it twice.
    previewDebouncer.cancel();
    await bridge().settings.save(draft);
    close();
  };

  function render() {
    if (!snapshot || !draft) return;
    const focusId = (root.activeElement as HTMLElement | null)?.dataset?.focusId;
    sourceRefresh = null;
    const t = createTranslator(snapshot.locale, snapshot.messages, snapshot.fallback);
    const ctx: ModalContext = {
      draft,
      snapshot,
      t,
      update(next, options) {
        draft = next;
        ctx.draft = next;
        if (options?.rerender === false) {
          previewDebouncer.call();
          return;
        }
        previewNow();
        render();
      },
      flushPreview: () => previewDebouncer.flush(),
      source: () => sourceMessage ?? snapshot!.source,
      onSourceRefresh: (refresh) => { sourceRefresh = refresh; },
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
    // Now that the tab is mounted, let it style the panel (e.g. legible fallback colours).
    // Set by the tab during TABS[tab](ctx) above (TypeScript cannot see assignments made through callbacks).
    (sourceRefresh as (() => void) | null)?.();
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
      sourceMessage = snapshot.source;
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
