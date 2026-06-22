import { describe, it, expect } from 'vitest';
import { WaitTimeTracker } from '../src/wait-time.js';

describe('WaitTimeTracker', () => {
  it('first attempt: wait = processedOn - timestamp', () => {
    const t = new WaitTimeTracker(100);
    expect(t.waitSeconds('j1', { timestamp: 1000, processedOn: 1500, attemptsMade: 1 })).toBeCloseTo(
      0.5,
    );
  });

  it('retry attempt: wait excludes prior attempt runtime (no inflation)', () => {
    const t = new WaitTimeTracker(100);
    // attempt 1: created 1000, ran, finished 3000, then failed
    t.recordFinish('j1', 3000);
    // attempt 2: re-queued, picked up 3200 => true wait 0.2s, NOT 3200-1000=2.2s
    expect(t.waitSeconds('j1', { timestamp: 1000, processedOn: 3200, attemptsMade: 2 })).toBeCloseTo(
      0.2,
    );
  });

  it('never returns a negative wait', () => {
    const t = new WaitTimeTracker(100);
    expect(
      t.waitSeconds('j1', { timestamp: 5000, processedOn: 1000, attemptsMade: 1 }),
    ).toBe(0);
  });

  it('evicts oldest beyond capacity (bounded memory)', () => {
    const t = new WaitTimeTracker(2);
    t.recordFinish('a', 1);
    t.recordFinish('b', 2);
    t.recordFinish('c', 3);
    expect(t.has('a')).toBe(false);
    expect(t.has('c')).toBe(true);
  });
});
