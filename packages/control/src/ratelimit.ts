interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimiterOptions {
  /** Max tokens in a bucket (burst). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
  now?: () => number;
  /** Max distinct keys tracked; oldest is evicted beyond this (bounded memory). */
  maxKeys?: number;
}

/**
 * In-memory token-bucket rate limiter, keyed by identity or IP. Bounded: beyond
 * `maxKeys` the oldest bucket is evicted, so a flood of unique keys cannot grow
 * memory without limit (abuse resistance).
 */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(opts: RateLimiterOptions) {
    this.capacity = opts.capacity;
    this.refillPerSec = opts.refillPerSec;
    this.now = opts.now ?? (() => Date.now());
    this.maxKeys = opts.maxKeys ?? 10_000;
  }

  get size(): number {
    return this.buckets.size;
  }

  /** Consume `cost` tokens for `key`. Returns false (rate-limited) if insufficient. */
  tryRemove(key: string, cost = 1): boolean {
    const t = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value as string | undefined;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { tokens: this.capacity, lastRefill: t };
      this.buckets.set(key, bucket);
    } else {
      const elapsedSec = (t - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
      bucket.lastRefill = t;
    }
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return true;
    }
    return false;
  }
}
