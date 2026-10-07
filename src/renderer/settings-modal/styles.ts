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
main { overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 20px; }
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
fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; min-inline-size: 0; }
fieldset:disabled { opacity: 0.5; }
legend { font-weight: 600; padding: 0; margin-block-end: 6px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.row > label:first-child { min-inline-size: 150px; }
input[type="color"] { inline-size: 40px; block-size: 30px; padding: 0; border: 0; background: none; cursor: pointer; }
input[type="text"], select {
  font: inherit; color: inherit;
  background: var(--bz-bg-2);
  border: 1px solid var(--bz-divider); border-radius: 6px; padding: 6px 8px;
}
input[type="text"].hex { inline-size: 9ch; font-family: ui-monospace, monospace; }
input[aria-invalid="true"] { border-color: var(--bz-error); }
.hint { color: var(--bz-text-2); font-size: 12px; margin: 0; }
.warning { color: var(--bz-error); margin: 0; }
.warning:empty { display: none; }
details summary { cursor: pointer; font-weight: 600; }
.var-row code { font-family: ui-monospace, monospace; font-size: 12px; min-inline-size: 300px; }
.swatch { inline-size: 18px; block-size: 18px; border-radius: 4px; border: 1px solid var(--bz-divider); }
.auto { color: var(--bz-text-2); font-size: 12px; }
a { color: var(--bz-accent-text); }
`;
