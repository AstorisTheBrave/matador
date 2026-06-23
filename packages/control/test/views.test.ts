import { describe, it, expect } from 'vitest';
import { sanitizeFailedJob, clampPageSize, paginate } from '../src/views.js';

describe('sanitizeFailedJob', () => {
  it('keeps safe metadata and drops the payload and stacktrace', () => {
    const v = sanitizeFailedJob({
      id: '42',
      name: 'send',
      failedReason: 'boom',
      attemptsMade: 2,
      timestamp: 1000,
      processedOn: 1500,
      data: { secret: 'pii' },
      stacktrace: ['line'],
    });
    expect(v).toEqual({
      id: '42',
      name: 'send',
      failedReason: 'boom',
      attemptsMade: 2,
      timestamp: 1000,
      processedOn: 1500,
      finishedOn: undefined,
    });
    expect(JSON.stringify(v)).not.toContain('pii');
    expect(JSON.stringify(v)).not.toContain('stacktrace');
  });

  it('truncates an oversized failure reason', () => {
    const v = sanitizeFailedJob({ id: '1', failedReason: 'x'.repeat(2000) });
    expect(v.failedReason.length).toBe(500);
  });
});

describe('clampPageSize', () => {
  it('defaults and clamps', () => {
    expect(clampPageSize(undefined, 25, 100)).toBe(25);
    expect(clampPageSize(0, 25, 100)).toBe(25);
    expect(clampPageSize(50, 25, 100)).toBe(50);
    expect(clampPageSize(1000, 25, 100)).toBe(100);
  });
});

describe('paginate', () => {
  it('slices by page and reports total', () => {
    const items = [1, 2, 3, 4, 5];
    expect(paginate(items, 1, 2)).toEqual({ items: [1, 2], page: 1, pageSize: 2, total: 5 });
    expect(paginate(items, 3, 2)).toEqual({ items: [5], page: 3, pageSize: 2, total: 5 });
    expect(paginate(items, 0, 2).page).toBe(1); // invalid page -> 1
  });
});
