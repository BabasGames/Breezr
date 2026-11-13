// Discord refuses status updates that come too fast (RATE_LIMITED) and counts the refused ones too: retrying at a
// steady pace after a burst of skips kept it refusing for good, stuck on an old track. So sends stay under a
// sliding window, and each refusal doubles the wait before the next try, giving Discord's window time to empty.

export function createSendGate(opts: {
  max?: number;
  windowMs?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
} = {}) {
  const max = opts.max ?? 4;
  const windowMs = opts.windowMs ?? 20_000;
  const backoffMs = opts.backoffMs ?? 5_000;
  const maxBackoffMs = opts.maxBackoffMs ?? 60_000;
  const now = opts.now ?? Date.now;
  let sent: number[] = [];
  let failures = 0;
  let retryAt = 0;

  return {
    /** True when a send may start now; the send is then counted. */
    take(): boolean {
      const t = now();
      if (t < retryAt) return false;
      sent = sent.filter((at) => t - at < windowMs);
      if (sent.length >= max) return false;
      sent.push(t);
      return true;
    },
    /** Discord took the update. */
    succeeded() {
      failures = 0;
      retryAt = 0;
    },
    /** Discord refused the update (or did not answer): wait 5 s, then 10, 20, 40, 60 at most. */
    failed() {
      retryAt = now() + Math.min(maxBackoffMs, backoffMs * 2 ** failures);
      failures++;
    },
    /** A new connection to Discord starts with a clean slate. */
    reset() {
      sent = [];
      failures = 0;
      retryAt = 0;
    },
  };
}
