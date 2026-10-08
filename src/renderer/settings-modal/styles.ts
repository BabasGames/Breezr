// Colors come from Deezer's own Tempo tokens (falling back to the older --color-* set), so the modal follows
// both Deezer's built-in color presets and Breezr's custom theme. Custom properties survive `all: initial`.
// Logical properties only (inline/block), so the layout mirrors itself in Arabic.
export const STYLES = `
:host { all: initial; }
.backdrop {
  --bz-bg: var(--tempo-colors-background-neutral-primary-default, var(--color-bg-main, #0f0d13));
  --bz-bg-2: var(--tempo-colors-background-neutral-secondary-default, var(--color-bg-secondary, #1b191f));
  --bz-bg-3: var(--tempo-colors-background-neutral-tertiary-default, var(--color-bg-tertiary, #29282d));
  --bz-bg-3-hover: var(--tempo-colors-background-neutral-tertiary-hovered, var(--color-bg-tertiary-hover, #3a393d));
  --bz-divider: var(--tempo-colors-divider-neutral-primary-default, var(--color-divider-main, #555257));
  --bz-text: var(--tempo-colors-text-neutral-primary-default, var(--color-text-main, #fdfcfe));
  --bz-text-2: var(--tempo-colors-text-neutral-secondary-default, var(--color-text-secondary, #a9a6aa));
  --bz-accent: var(--tempo-colors-background-accent-primary-default, var(--color-accent-main, #a238ff));
  --bz-on-accent: var(--tempo-colors-text-accent-onAccent-default, #ffffff);
  --bz-accent-text: var(--tempo-colors-text-accent-primary-default, var(--color-accent-main, #a238ff));
  --bz-error: var(--tempo-colors-text-feedback-error-default, #f44336);
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  background: rgb(0 0 0 / 0.55);
  font: 14px/1.45 Inter, system-ui, sans-serif;
  color: var(--bz-text);
}
/* The previewed palette is unreadable: keep the settings themselves legible (Deezer's own dark colours),
   so the user can always read their way back. The page behind still shows the preview. */
.backdrop.safe-colors {
  --bz-bg: #0f0d13; --bz-bg-2: #1b191f; --bz-bg-3: #29282d; --bz-bg-3-hover: #3a393d; --bz-divider: #555257;
  --bz-text: #fdfcfe; --bz-text-2: #a9a6aa; --bz-accent: #a238ff; --bz-on-accent: #ffffff; --bz-accent-text: #c17aff;
  --bz-error: #ff6e84;
}
.panel {
  display: grid; grid-template-columns: 180px 1fr; grid-template-rows: auto 1fr auto;
  inline-size: min(820px, calc(100vw - 32px)); block-size: min(660px, calc(100vh - 32px));
  background: var(--bz-bg);
  border: 1px solid var(--bz-divider); border-radius: 12px;
  overflow: hidden; box-shadow: 0 20px 60px rgb(0 0 0 / 0.5);
}
header { grid-column: 1 / -1; padding: 16px 20px; font-size: 18px; font-weight: 700; border-block-end: 1px solid var(--bz-divider); }
nav { display: flex; flex-direction: column; gap: 4px; padding: 12px; background: var(--bz-bg-2); }
nav button { text-align: start; background: transparent; }
nav button[aria-selected="true"] { background: var(--bz-bg-3); color: var(--bz-accent-text); }
main { overflow: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 28px; }
/* The modal is a shadow tree: Deezer's own scrollbar styling does not reach it. Thin, in the theme's colours. */
.panel, .panel * { scrollbar-width: thin; scrollbar-color: var(--bz-divider) transparent; }
main > div { display: flex; flex-direction: column; gap: 28px; }
footer { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-block-start: 1px solid var(--bz-divider); }
button {
  font: inherit; color: inherit; cursor: pointer;
  background: var(--bz-bg-3); border: 0; border-radius: 8px; padding: 8px 14px;
}
button:hover { background: var(--bz-bg-3-hover); }
button.primary { background: var(--bz-accent); color: var(--bz-on-accent); }
button:disabled { opacity: 0.4; cursor: default; }
/* Provided by the colour source (or unavailable): visibly read-only. */
input:disabled, select:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible {
  outline: 2px solid var(--bz-accent); outline-offset: 2px;
}
fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 28px; min-inline-size: 0; }
fieldset:disabled { opacity: 0.5; }
legend { font-weight: 600; padding: 0; margin-block-end: 6px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
input[type="color"] { inline-size: 40px; block-size: 30px; padding: 0; border: 0; background: none; cursor: pointer; }
input[type="text"], select {
  font: inherit; color: inherit; box-sizing: border-box; block-size: 32px;
  background: var(--bz-bg-2);
  border: 1px solid var(--bz-divider); border-radius: 6px; padding: 6px 8px;
}
input[type="text"].hex { inline-size: 9ch; font-family: ui-monospace, monospace; }
input[aria-invalid="true"] { border-color: var(--bz-error); }
.hint { color: var(--bz-text-2); font-size: 12px; margin: 0; }
.warning { color: var(--bz-error); margin: 0; }
.warning:empty { display: none; }
/* Sections: a small title, then one setting per line — name on one side, control on the other, all aligned. */
.section { display: flex; flex-direction: column; }
.section > h3 {
  margin: 0 0 2px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--bz-text-2);
}
.setting {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 16px;
  min-block-size: 48px; padding-block: 6px; box-sizing: border-box;
  border-block-end: 1px solid color-mix(in srgb, var(--bz-divider) 40%, transparent);
}
.section > .setting:last-child, fieldset > .setting:last-child { border-block-end: 0; }
.setting-label { display: flex; align-items: center; gap: 8px; min-inline-size: 0; }
.setting-control { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.setting-message { grid-column: 1 / -1; }
.section > fieldset { gap: 0; }
.section > .warning { padding-block: 8px; }
.help {
  display: inline-grid; place-items: center; flex: none; inline-size: 16px; block-size: 16px; border-radius: 50%;
  font-size: 11px; font-weight: 700; line-height: 1; cursor: help; user-select: none;
  background: var(--bz-bg-3); color: var(--bz-text-2);
}
.help:hover, .help:focus-visible { color: var(--bz-text); background: var(--bz-bg-3-hover); }
.help:focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 2px; }
.tip {
  position: fixed; inset: auto; margin: 0; box-sizing: border-box; inline-size: max-content; max-inline-size: 280px;
  padding: 8px 10px; border-radius: 8px; border: 1px solid var(--bz-divider);
  background: var(--bz-bg-3); color: var(--bz-text); font-size: 12px; line-height: 1.45;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
  /* Read-only: it must never take the pointer from its "?", or hovering would close it at once. */
  pointer-events: none;
}
.switch {
  appearance: none; position: relative; flex: none; margin: 0; cursor: pointer;
  inline-size: 38px; block-size: 22px; border-radius: 999px; box-sizing: border-box;
  background: var(--bz-bg-3); border: 1px solid var(--bz-divider); transition: background 0.15s, border-color 0.15s;
}
.switch::before {
  content: ''; position: absolute; inset-block-start: 3px; inset-inline-start: 3px; inline-size: 14px; block-size: 14px;
  border-radius: 50%; background: var(--bz-text-2); transition: inset-inline-start 0.15s, background 0.15s;
}
.switch:checked { background: var(--bz-accent); border-color: var(--bz-accent); }
.switch:checked::before { inset-inline-start: 19px; background: var(--bz-on-accent); }
@media (prefers-reduced-motion: reduce) { .switch, .switch::before { transition: none; } }
/* Live state of the colour source: a dot and a few words. */
.status { display: flex; align-items: center; gap: 8px; margin: 0; padding-block: 8px; font-size: 12px; color: var(--bz-text-2); }
.status::before { content: ''; inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--bz-accent); flex: none; }
.status.problem { color: var(--bz-error); }
.status.problem::before { background: var(--bz-error); }
.status:empty { display: none; }
details summary { cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; min-block-size: 32px; }
details[open] summary { margin-block-end: 8px; }
.about-head { display: flex; flex-direction: column; gap: 4px; }
.about-head strong { font-size: 20px; }
.about p { margin: 0; }
.links { display: flex; flex-wrap: wrap; gap: 8px; margin-block-start: 12px; }
a.button {
  display: inline-flex; align-items: center; padding: 8px 14px; border-radius: 8px; text-decoration: none;
  background: var(--bz-bg-3); color: var(--bz-text);
}
a.button:hover { background: var(--bz-bg-3-hover); }
a.button.primary { background: var(--bz-accent); color: var(--bz-on-accent); }
.small { display: flex; flex-direction: column; gap: 4px; color: var(--bz-text-2); font-size: 12px; }
.var-row code { font-family: ui-monospace, monospace; font-size: 12px; min-inline-size: 300px; }
.swatch { inline-size: 18px; block-size: 18px; border-radius: 4px; border: 1px solid var(--bz-divider); }
.auto { color: var(--bz-text-2); font-size: 12px; }
a { color: var(--bz-accent-text); }
`;
