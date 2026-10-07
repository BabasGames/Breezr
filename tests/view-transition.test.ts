import { describe, expect, test } from 'bun:test';
import { VT_RELEASE_JS, VT_START_JS, VT_STYLE_CSS, runViewTransition } from '../src/main/view-transition';

const never = () => new Promise<never>(() => undefined);

describe('runViewTransition', () => {
  test('happy path: start, then mutate, then release', async () => {
    const log: string[] = [];
    const exec = async (js: string) => {
      log.push(js === VT_START_JS ? 'start' : js === VT_RELEASE_JS ? 'release' : 'other');
      return true;
    };
    const result = await runViewTransition(exec, async () => { log.push('mutate'); });
    expect(result).toBe('faded');
    expect(log).toEqual(['start', 'mutate', 'release']);
  });

  test('page says no (reduced motion, hidden, no API): direct, no release', async () => {
    const log: string[] = [];
    const exec = async (js: string) => { log.push(js === VT_START_JS ? 'start' : 'release'); return false; };
    expect(await runViewTransition(exec, async () => { log.push('mutate'); })).toBe('direct');
    expect(log).toEqual(['start', 'mutate']);
  });

  test('start rejects (page navigating): direct', async () => {
    let mutated = 0;
    const exec = async () => { throw new Error('Execution context was destroyed'); };
    expect(await runViewTransition(exec, async () => { mutated++; })).toBe('direct');
    expect(mutated).toBe(1);
  });

  test('page never answers: direct after the timeout, and the next call still works (Review Focus 4)', async () => {
    let mutated = 0;
    const t0 = Date.now();
    expect(await runViewTransition(never, async () => { mutated++; }, 50)).toBe('direct');
    expect(Date.now() - t0).toBeLessThan(500);
    expect(mutated).toBe(1);
    expect(await runViewTransition(async () => true, async () => { mutated++; }, 50)).toBe('faded');
    expect(mutated).toBe(2);
  });

  test('release never answers: still resolves after the timeout', async () => {
    const exec = (js: string) => (js === VT_START_JS ? Promise.resolve(true) : never());
    expect(await runViewTransition(exec, async () => undefined, 50)).toBe('faded');
  });

  test('mutate throws: the page is still released, the error propagates', async () => {
    const log: string[] = [];
    const exec = async (js: string) => { log.push(js === VT_START_JS ? 'start' : 'release'); return true; };
    await expect(runViewTransition(exec, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(log).toEqual(['start', 'release']);
  });
});

describe('page scripts', () => {
  test('start checks reduced motion, visibility and API support, and self-releases', () => {
    expect(VT_START_JS).toContain('prefers-reduced-motion: reduce');
    expect(VT_START_JS).toContain("visibilityState !== 'visible'");
    expect(VT_START_JS).toContain('startViewTransition');
    expect(VT_START_JS).toContain("types: ['breezr-theme']");
    expect(VT_START_JS).toContain('1500');
  });
  test('style only affects our own transitions, 600 ms', () => {
    expect(VT_STYLE_CSS).toContain(':active-view-transition-type(breezr-theme)');
    expect(VT_STYLE_CSS).toContain('600ms');
  });
});
