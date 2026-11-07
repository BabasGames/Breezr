const SPEED_PX_PER_S = 40;
const MIN_SECONDS = 5;

/**
 * How a text that does not fit should slide: by exactly what overflows (towards the end of the line, so
 * leftwards in LTR and rightwards in RTL), slowly enough to be read. null when it fits (1px tolerance for
 * sub-pixel rounding).
 */
export function marquee(boxWidth: number, textWidth: number, rtl: boolean): { shift: number; seconds: number } | null {
  const overflow = Math.ceil(textWidth - boxWidth);
  if (overflow <= 1) return null;
  // Pauses at both ends are part of the animation (keyframes), so the travel itself gets ~70% of the time.
  const seconds = Math.max(MIN_SECONDS, Math.round((overflow / SPEED_PX_PER_S / 0.7) * 10) / 10);
  return { shift: rtl ? overflow : -overflow, seconds };
}

/** Applies the slide to `box` (its single child span moves); re-run after the text or the width changes. */
export function applyMarquee(box: HTMLElement) {
  box.classList.remove('marquee');
  // The box's own scrollWidth: an inline span always reports 0.
  const slide = marquee(box.clientWidth, box.scrollWidth, getComputedStyle(box).direction === 'rtl');
  if (!slide || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  box.style.setProperty('--shift', `${slide.shift}px`);
  box.style.setProperty('--marquee-duration', `${slide.seconds}s`);
  box.classList.add('marquee');
}
