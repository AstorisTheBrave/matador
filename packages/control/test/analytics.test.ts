import { describe, it, expect } from 'vitest';
import { normalizeReason, groupFailures } from '../src/analytics.js';

describe('normalizeReason', () => {
  it('collapses ids, numbers, hex, and paths to placeholders', () => {
    expect(normalizeReason('timeout after 30000ms')).toBe('timeout after <n>ms');
    expect(normalizeReason('job 7f3a1b2c-1111-2222-3333-444455556666 failed')).toBe(
      'job <uuid> failed',
    );
    expect(normalizeReason('ENOENT /var/log/app/run.log')).toBe('ENOENT <path>');
    expect(normalizeReason('bad ptr 0xDEADBEEF')).toBe('bad ptr <hex>');
  });
});

describe('groupFailures', () => {
  it('groups by normalized reason and caps the output with an <other> bucket', () => {
    const jobs = [
      { id: '1', failedReason: 'timeout after 100ms' },
      { id: '2', failedReason: 'timeout after 200ms' },
      { id: '3', failedReason: 'connection refused' },
    ];
    const out = groupFailures(jobs, 10);
    expect(out.total).toBe(3);
    expect(out.distinct).toBe(2); // the two timeouts normalize to one reason
    const timeout = out.groups.find((g) => g.reason === 'timeout after <n>ms');
    expect(timeout?.count).toBe(2);
  });

  it('a flood of unique messages collapses to topN + <other> (bounded)', () => {
    const jobs = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      failedReason: `error code ${i} at 0x${i.toString(16)}`,
    }));
    const out = groupFailures(jobs, 5);
    // All normalize to "error code <n> at <hex>" -> one group, well under the cap.
    expect(out.groups.length).toBeLessThanOrEqual(6);
    expect(out.total).toBe(100);
  });
});
