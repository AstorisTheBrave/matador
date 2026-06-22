import { describe, it, expect, vi } from 'vitest';
import { safe } from '../src/failopen.js';

describe('safe', () => {
  it('runs the fn and returns its value', () => {
    expect(safe(() => 42, vi.fn())).toBe(42);
  });

  it('swallows throws and reports them, never rethrows', () => {
    const onError = vi.fn();
    expect(() =>
      safe(() => {
        throw new Error('boom');
      }, onError),
    ).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('does not throw even if the error reporter throws', () => {
    expect(() =>
      safe(
        () => {
          throw new Error('boom');
        },
        () => {
          throw new Error('reporter exploded');
        },
      ),
    ).not.toThrow();
  });
});
