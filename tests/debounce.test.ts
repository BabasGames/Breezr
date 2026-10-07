import { describe, expect, test } from 'bun:test';
import { createDebouncer, type Timers } from '../src/shared/debounce';

// Manual clock: timers only fire when advance() is called.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set(fn, ms) { const id = nextId++; pending.set(id, { at: now + ms, fn }); return id; },
    clear(handle) { pending.delete(handle as number); },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) { pending.delete(id); t.fn(); }
    }
  };
  return { timers, advance };
}

describe('createDebouncer', () => {
  test('a burst of calls runs once, with the last arguments, after the delay', () => {
    const { timers, advance } = fakeTimers();
    const calls: string[] = [];
    const d = createDebouncer((v: string) => calls.push(v), 400, timers);
    d.call('a'); advance(100); d.call('b'); advance(100); d.call('c');
    advance(399);
    expect(calls).toEqual([]);
    advance(1);
    expect(calls).toEqual(['c']);
  });

  test('each call restarts the delay', () => {
    const { timers, advance } = fakeTimers();
    const calls: number[] = [];
    const d = createDebouncer((v: number) => calls.push(v), 400, timers);
    d.call(1); advance(300); d.call(2); advance(300);
    expect(calls).toEqual([]);
    advance(100);
    expect(calls).toEqual([2]);
  });

  test('flush runs the pending call now, only once', () => {
    const { timers, advance } = fakeTimers();
    const calls: number[] = [];
    const d = createDebouncer((v: number) => calls.push(v), 400, timers);
    d.call(7);
    expect(d.pending()).toBe(true);
    d.flush();
    expect(calls).toEqual([7]);
    expect(d.pending()).toBe(false);
    advance(1000);
    expect(calls).toEqual([7]);
  });

  test('flush without a pending call does nothing', () => {
    const { timers } = fakeTimers();
    const calls: number[] = [];
    createDebouncer((v: number) => calls.push(v), 400, timers).flush();
    expect(calls).toEqual([]);
  });

  test('cancel drops the pending call', () => {
    const { timers, advance } = fakeTimers();
    const calls: number[] = [];
    const d = createDebouncer((v: number) => calls.push(v), 400, timers);
    d.call(1); d.cancel(); advance(1000);
    expect(calls).toEqual([]);
    expect(d.pending()).toBe(false);
  });

  test('works with the real timers by default', async () => {
    const calls: number[] = [];
    const d = createDebouncer((v: number) => calls.push(v), 10);
    d.call(1); d.call(2);
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toEqual([2]);
  });
});
