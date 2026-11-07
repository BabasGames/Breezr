import { expect, test } from 'bun:test';
import { openLiveStream } from '../web/src/stream';

class FakeSource {
  static instances: FakeSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeSource.instances.push(this); }
  close() { this.closed = true; this.readyState = 2; }
}

test('after an error the browser gives up on, the page opens a new stream with growing delays', () => {
  FakeSource.instances = [];
  const timers: { ms: number; fn: () => void }[] = [];
  const states: string[] = [];
  openLiveStream('/api/live/x/events', {
    message: () => undefined, connected: () => states.push('connected'), reconnecting: () => states.push('reconnecting'),
  }, { create: (u) => new FakeSource(u) as never, delays: [2000, 5000], setTimer: (fn, ms) => timers.push({ fn, ms }) });

  const first = FakeSource.instances[0];
  first.readyState = 2;
  first.onerror!();
  expect(first.closed).toBe(true);
  expect(timers.map((t) => t.ms)).toEqual([2000]);
  timers[0].fn();
  expect(FakeSource.instances.length).toBe(2);
  FakeSource.instances[1].readyState = 2;
  FakeSource.instances[1].onerror!();
  FakeSource.instances[1].readyState = 2;
  expect(timers.map((t) => t.ms)).toEqual([2000, 5000]);
  timers[1].fn();
  FakeSource.instances[2].readyState = 2;
  FakeSource.instances[2].onerror!();
  expect(timers.at(-1)!.ms).toBe(5000);
  FakeSource.instances[3]?.onopen?.();
  expect(states).toContain('reconnecting');
});

test('a passing error the browser recovers from by itself opens no extra stream', () => {
  FakeSource.instances = [];
  const timers: unknown[] = [];
  openLiveStream('/x', { message: () => undefined, connected: () => undefined, reconnecting: () => undefined },
    { create: (u) => new FakeSource(u) as never, delays: [2000], setTimer: (fn) => timers.push(fn) });
  FakeSource.instances[0].readyState = 0;
  FakeSource.instances[0].onerror!();
  expect(timers.length).toBe(0);
  expect(FakeSource.instances.length).toBe(1);
});
