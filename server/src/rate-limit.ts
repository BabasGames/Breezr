/** Token bucket per key: `capacity` requests at once, then `refillPerSec` per second. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();
  private calls = 0;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const now = this.now();
    if (++this.calls % 1000 === 0) this.prune(now);
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
    bucket.tokens = this.refilled(bucket, now);
    bucket.updated = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  private refilled(bucket: { tokens: number; updated: number }, now: number): number {
    return Math.min(this.capacity, bucket.tokens + ((now - bucket.updated) / 1000) * this.refillPerSec);
  }

  /** A bucket back to full carries no information: forget it, so the map does not grow with every visitor. */
  private prune(now: number) {
    for (const [key, bucket] of this.buckets) if (this.refilled(bucket, now) >= this.capacity) this.buckets.delete(key);
  }
}
