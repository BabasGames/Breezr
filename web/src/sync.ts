/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * The viewer's clock can be minutes off: positions are computed on the server's clock, estimated from
 * the server time sent with each message and the local time it arrived.
 */
export function createClock(serverNow: number, localNow: number) {
  const offset = serverNow - localNow;
  return { serverTime: (local: number) => local + offset };
}
