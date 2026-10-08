import { h, type Child } from './dom';
import type { Translate } from '../../shared/i18n';

let tipCount = 0;

/** Puts the bubble under the "?" (above it near the bottom), kept inside the window, mirrored in RTL. */
function place(anchor: HTMLElement, tip: HTMLElement) {
  const a = anchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: hgt } = tip;
  const rtl = getComputedStyle(anchor).direction === 'rtl';
  const left = Math.min(Math.max(8, rtl ? a.right - w : a.left - 8), innerWidth - w - 8);
  const below = a.bottom + 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${below + hgt > innerHeight - 8 ? a.top - hgt - 6 : below}px`;
}

/**
 * A small "?" whose explanation shows in a bubble on hover, keyboard focus or click. The bubble is a popover
 * (top layer), so the scrolling panel never clips it. A span, not a button: a disabled fieldset would
 * otherwise disable it too, and the explanation matters most when a setting is greyed out.
 */
export function helpTip(text: string, label: string): HTMLElement {
  const id = `bz-tip-${++tipCount}`;
  const tip = h('div', { id, class: 'tip', popover: 'manual', role: 'tooltip' }, text);
  const help = h('span', { class: 'help', role: 'button', tabindex: '0', 'aria-label': label, 'aria-describedby': id }, '?');
  const show = () => {
    if (!tip.isConnected || tip.matches(':popover-open')) return;
    tip.showPopover();
    place(help, tip);
  };
  const hide = () => {
    if (tip.matches(':popover-open')) tip.hidePopover();
  };
  help.addEventListener('mouseenter', show);
  help.addEventListener('mouseleave', () => { if (help !== (help.getRootNode() as ShadowRoot).activeElement) hide(); });
  help.addEventListener('focus', show);
  help.addEventListener('blur', hide);
  help.addEventListener('click', (event) => {
    // Inside a <summary>, a click would also fold/unfold the section.
    event.preventDefault();
    event.stopPropagation();
    show();
  });
  return h('span', { class: 'help-wrap' }, help, tip);
}

/** Hides every open bubble (the panel scrolled: they would float away from their "?"). */
export function hideTips(root: ParentNode) {
  for (const tip of root.querySelectorAll<HTMLElement>('.tip:popover-open')) tip.hidePopover();
}

export function createUi(t: Translate) {
  const help = (text: string | undefined) => (text ? helpTip(text, t('settings.help')) : null);
  return {
    help,
    /** A titled group of settings. */
    section: (title: string | null, ...children: Child[]) =>
      h('section', { class: 'section' }, title ? h('h3', {}, title) : null, ...children),
    /** One setting: its name (and "?") on one side, its control(s) on the other; `message` spans the row below. */
    setting: (opts: { label: string; id?: string; help?: string; message?: Child }, ...controls: Child[]) =>
      h('div', { class: 'setting' },
        h('div', { class: 'setting-label' },
          opts.id ? h('label', { for: opts.id }, opts.label) : h('span', {}, opts.label),
          help(opts.help)),
        h('div', { class: 'setting-control' }, ...controls),
        opts.message ? h('div', { class: 'setting-message' }, opts.message) : null),
    /** An on/off switch (a checkbox underneath, so keyboard and screen readers work as usual). */
    toggle: (id: string, checked: boolean, onChange: (checked: boolean) => void) => {
      const el = h('input', { type: 'checkbox', role: 'switch', class: 'switch', id, checked, 'data-focus-id': id });
      el.addEventListener('change', () => onChange(el.checked));
      return el;
    },
  };
}
