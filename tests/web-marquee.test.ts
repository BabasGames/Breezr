import { expect, test } from 'bun:test';
import { marquee } from '../web/src/marquee';

test('a title that fits does not move', () => {
  expect(marquee(300, 300, false)).toBeNull();
  expect(marquee(300, 301, false)).toBeNull();
});

test('a longer title slides by exactly what overflows, left in LTR, right in RTL', () => {
  expect(marquee(300, 420, false)!.shift).toBe(-120);
  expect(marquee(300, 420, true)!.shift).toBe(120);
});

test('longer overflow, longer (but readable) duration', () => {
  const short = marquee(300, 340, false)!.seconds;
  const long = marquee(300, 900, false)!.seconds;
  expect(short).toBeGreaterThanOrEqual(5);
  expect(long).toBeGreaterThan(short);
});
