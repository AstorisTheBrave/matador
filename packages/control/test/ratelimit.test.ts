import { describe, it, expect } from 'vitest';
import { KeyedRateLimiter } from '../src/ratelimit.js';

describe('KeyedRateLimiter', () => {
  it('allows up to capacity then rate-limits per key', () => {
    const rl = new KeyedRateLimiter({ capacity: 3, refillPerSec: 1 });
    expect(rl.tryRemove('a')).toBe(true);
    expect(rl.tryRemove('a')).toBe(true);
    expect(rl.tryRemove('a')).toBe(true);
    expect(rl.tryRemove('a')).toBe(false); // bucket empty
    expect(rl.tryRemove('b')).toBe(true); // separate key, own bucket
  });

  it('refills over time', () => {
    let now = 1000;
    const rl = new KeyedRateLimiter({ capacity: 1, refillPerSec: 1, now: () => now });
    expect(rl.tryRemove('a')).toBe(true);
    expect(rl.tryRemove('a')).toBe(false);
    now += 1000; // 1s -> +1 token
    expect(rl.tryRemove('a')).toBe(true);
  });

  it('bounds memory by evicting the oldest key', () => {
    const rl = new KeyedRateLimiter({ capacity: 1, refillPerSec: 1, maxKeys: 2 });
    rl.tryRemove('a');
    rl.tryRemove('b');
    rl.tryRemove('c'); // evicts 'a'
    expect(rl.size).toBeLessThanOrEqual(2);
  });
});
