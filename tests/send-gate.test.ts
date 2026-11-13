import { describe, expect, test } from 'bun:test';
import { createSendGate } from '../src/main/rpc/send-gate';

const S = 1000;

function setup() {
  let t = 0;
  const gate = createSendGate({ max: 4, windowMs: 20 * S, backoffMs: 5 * S, maxBackoffMs: 60 * S, now: () => t });
  return { gate, advance: (ms: number) => { t += ms; } };
}

describe('Discord send gate', () => {
  test('at most 4 sends in any 20 seconds', () => {
    const { gate, advance } = setup();
    for (let i = 0; i < 4; i++) expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(false);
    advance(20 * S - 1);
    expect(gate.take()).toBe(false);
    advance(1);
    expect(gate.take()).toBe(true);
  });

  test('after a burst of skips, a Discord that counts its refusals still gets the last track', () => {
    let t = 0;
    const gate = createSendGate({ now: () => t });
    // Discord's real limit is not documented and is stricter than a retry every 5 s (that kept Breezr refused
    // for minutes): model one that refuses after 3 requests in 30 s, refused ones included.
    const seen: number[] = [];
    const discordAccepts = () => {
      const recent = seen.filter((at) => t - at < 30 * S).length;
      seen.push(t);
      return recent < 3;
    };
    // The burst of skips already filled Discord's window.
    for (let i = 0; i < 5; i++) seen.push(0);
    let landed: number | null = null;
    // The player poll asks every 1.5 s for 3 minutes.
    for (; t < 180 * S && landed === null; t += 1500) {
      if (!gate.take()) continue;
      if (discordAccepts()) { gate.succeeded(); landed = t; } else gate.failed();
    }
    expect(landed).not.toBeNull();
    expect(landed!).toBeLessThan(60 * S);
  });

  test('a refused send waits longer each time, so Discord\'s window can empty', () => {
    const { gate, advance } = setup();
    expect(gate.take()).toBe(true);
    gate.failed();
    advance(5 * S - 1);
    expect(gate.take()).toBe(false);
    advance(1);
    expect(gate.take()).toBe(true);
    gate.failed();
    advance(10 * S - 1);
    expect(gate.take()).toBe(false);
    advance(1);
    expect(gate.take()).toBe(true);
  });

  test('the wait after refusals stops growing at the cap', () => {
    const { gate, advance } = setup();
    for (let i = 0; i < 10; i++) {
      advance(60 * S);
      expect(gate.take()).toBe(true);
      gate.failed();
    }
    advance(60 * S);
    expect(gate.take()).toBe(true);
  });

  test('a send that lands clears the wait', () => {
    const { gate, advance } = setup();
    gate.take();
    gate.failed();
    advance(5 * S);
    gate.take();
    gate.failed();
    advance(10 * S);
    gate.take();
    gate.succeeded();
    advance(21 * S);
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(true);
  });

  test('reset (Discord reconnected) allows a send at once', () => {
    const { gate } = setup();
    for (let i = 0; i < 4; i++) gate.take();
    gate.failed();
    expect(gate.take()).toBe(false);
    gate.reset();
    expect(gate.take()).toBe(true);
  });
});
