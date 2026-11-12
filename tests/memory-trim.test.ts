import { describe, expect, test } from 'bun:test';
import { createMemoryTrim } from '../src/main/memory-trim';

/** Timers driven by hand: `advance` runs what is due. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn: () => void, ms: number) => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clear: (id: number) => { timers.delete(id); },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

const MIN = 60_000;

function setup() {
  const timers = fakeTimers();
  let trims = 0;
  const trim = createMemoryTrim({
    trim: () => { trims++; },
    firstAfterMs: 2 * MIN, everyMs: 10 * MIN,
    setTimer: timers.set, clearTimer: timers.clear,
  });
  return { trim, timers, trims: () => trims };
}

describe('memory trim while Breezr is in the background', () => {
  test('nothing while the window has the focus', () => {
    const { timers, trims } = setup();
    timers.advance(60 * MIN);
    expect(trims()).toBe(0);
  });

  test('first trim 2 minutes after the window is left, then every 10 minutes', () => {
    const { trim, timers, trims } = setup();
    trim.background();
    timers.advance(2 * MIN - 1);
    expect(trims()).toBe(0);
    timers.advance(1);
    expect(trims()).toBe(1);
    timers.advance(10 * MIN);
    expect(trims()).toBe(2);
    timers.advance(20 * MIN);
    expect(trims()).toBe(4);
  });

  test('coming back stops it; a quick look away does nothing', () => {
    const { trim, timers, trims } = setup();
    trim.background();
    timers.advance(MIN);
    trim.foreground();
    timers.advance(30 * MIN);
    expect(trims()).toBe(0);
  });

  test('leaving twice in a row does not start two schedules', () => {
    const { trim, timers, trims } = setup();
    trim.background();
    trim.background();
    timers.advance(2 * MIN);
    expect(trims()).toBe(1);
  });

  test('a failing trim does not stop the next ones', () => {
    const timers = fakeTimers();
    let calls = 0;
    const trim = createMemoryTrim({
      trim: () => { calls++; throw new Error('debugger busy'); },
      firstAfterMs: 2 * MIN, everyMs: 10 * MIN, setTimer: timers.set, clearTimer: timers.clear,
    });
    trim.background();
    timers.advance(12 * MIN);
    expect(calls).toBe(2);
  });
});
