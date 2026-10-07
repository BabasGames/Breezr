import { describe, expect, test } from 'bun:test';
import { pageTweaksCss } from '../src/shared/page-tweaks';

describe('sidebar animation', () => {
  const css = pageTweaksCss({ animateSidebar: true });

  test('animates Deezer\'s sidebar width variable, and only that', () => {
    expect(css).toContain('@property --layout-sidebar-width');
    expect(css).toContain("syntax: '<length>'");
    expect(css).toContain('inherits: true');
    expect(css).toMatch(/transition: --layout-sidebar-width \d+ms/);
  });

  test('respects the system "reduce motion" setting', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  test('is left out when turned off', () => {
    expect(pageTweaksCss({ animateSidebar: false })).not.toContain('--layout-sidebar-width');
  });
});

describe('full-screen player', () => {
  test('hides the frozen page\'s scrollbar, only while Deezer freezes it', () => {
    for (const animateSidebar of [true, false]) {
      expect(pageTweaksCss({ animateSidebar })).toContain('body.has-scrollbar-disabled::-webkit-scrollbar { display: none; }');
    }
  });

  test('leaves the normal page scrollbar alone', () => {
    expect(pageTweaksCss({ animateSidebar: true })).not.toMatch(/(^|[\s,}])(body|html)?::-webkit-scrollbar/m);
  });
});
