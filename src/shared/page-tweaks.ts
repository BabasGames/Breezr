// Small CSS fixes and touches on Deezer's own page, independent of the colour theme. Pure CSS: no Deezer element is
// touched, and if Deezer renames what a rule relies on, that rule simply stops applying — nothing breaks.

// Deezer folds its left menu by switching one CSS variable on its layout root (243px ↔ 80px); the menu, the page and
// the top bar all follow it. Registering the variable as a <length> lets Chromium interpolate it, so they slide
// together instead of jumping.
const SIDEBAR_ANIMATION_CSS = `@property --layout-sidebar-width { syntax: '<length>'; inherits: true; initial-value: 243px; }
#dzr-app > .naboo { transition: --layout-sidebar-width 240ms ease; }
@media (prefers-reduced-motion: reduce) { #dzr-app > .naboo { transition: none; } }`;

// With the full-screen player or lyrics open, Deezer freezes the page behind (body.has-scrollbar-disabled) but keeps
// its scrollbar on purpose, which leaves an empty strip along the right edge of the overlay.
const FROZEN_PAGE_SCROLLBAR_CSS = 'body.has-scrollbar-disabled::-webkit-scrollbar { display: none; }';

export function pageTweaksCss(opts: { animateSidebar: boolean }): string {
  return [FROZEN_PAGE_SCROLLBAR_CSS, ...(opts.animateSidebar ? [SIDEBAR_ANIMATION_CSS] : [])].join('\n');
}
