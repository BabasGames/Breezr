import { expect, test } from 'bun:test';
import { withTimeout } from '../src/main/timeout';

test('returns the value when the promise is fast', async () => {
  expect(await withTimeout(Promise.resolve(42), 50)).toBe(42);
});
test("returns 'timeout' when the promise hangs (e.g. a stalled network mount at start-up)", async () => {
  const t0 = Date.now();
  expect(await withTimeout(new Promise(() => undefined), 40)).toBe('timeout');
  expect(Date.now() - t0).toBeLessThan(400);
});
test('propagates a rejection', async () => {
  await expect(withTimeout(Promise.reject(new Error('x')), 50)).rejects.toThrow('x');
});
