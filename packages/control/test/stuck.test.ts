import { describe, it, expect } from 'vitest';
import { StuckDetector } from '../src/stuck.js';

const s = (active: number, completed: number, failed = 0, paused = 0) => ({
  active,
  completed,
  failed,
  paused,
});

describe('StuckDetector', () => {
  it('flags a queue with persistent active work but no progress', () => {
    const d = new StuckDetector(3);
    d.record('q', s(2, 10));
    d.record('q', s(2, 10));
    expect(d.isStuck('q')).toBe(false); // not enough samples
    d.record('q', s(2, 10));
    expect(d.isStuck('q')).toBe(true); // active throughout, completed flat
  });

  it('is not stuck when throughput advances', () => {
    const d = new StuckDetector(3);
    d.record('q', s(2, 10));
    d.record('q', s(2, 11));
    d.record('q', s(2, 12));
    expect(d.isStuck('q')).toBe(false);
  });

  it('never flags a paused queue', () => {
    const d = new StuckDetector(3);
    d.record('q', s(2, 10, 0, 1));
    d.record('q', s(2, 10, 0, 1));
    d.record('q', s(2, 10, 0, 1));
    expect(d.isStuck('q')).toBe(false);
  });

  it('is not stuck when there is no active work', () => {
    const d = new StuckDetector(3);
    d.record('q', s(0, 10));
    d.record('q', s(0, 10));
    d.record('q', s(0, 10));
    expect(d.isStuck('q')).toBe(false);
  });
});
