import { describe, it, expect } from 'vitest';
import { ensureSecureBind, isLoopback, tokenMatches } from '../src/security.js';

describe('ensureSecureBind', () => {
  it('refuses a non-loopback bind with no token (fail closed)', () => {
    expect(() => ensureSecureBind({ host: '0.0.0.0', viewerToken: undefined, opsToken: undefined })).toThrow(
      /refuses to bind/,
    );
  });

  it('allows loopback with no token', () => {
    for (const host of ['127.0.0.1', '::1', 'localhost']) {
      expect(() => ensureSecureBind({ host, viewerToken: undefined, opsToken: undefined })).not.toThrow();
    }
  });

  it('allows a public bind when a token is set', () => {
    expect(() =>
      ensureSecureBind({ host: '0.0.0.0', viewerToken: 's3cret', opsToken: undefined }),
    ).not.toThrow();
    expect(() =>
      ensureSecureBind({ host: '10.0.0.5', viewerToken: undefined, opsToken: 'opsk' }),
    ).not.toThrow();
  });
});

describe('isLoopback', () => {
  it('classifies hosts', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('0.0.0.0')).toBe(false);
    expect(isLoopback('example.com')).toBe(false);
  });
});

describe('tokenMatches', () => {
  it('matches equal tokens, rejects mismatches and empties', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true);
    expect(tokenMatches('abc', 'abd')).toBe(false);
    expect(tokenMatches('ab', 'abc')).toBe(false);
    expect(tokenMatches(undefined, 'abc')).toBe(false);
    expect(tokenMatches('abc', undefined)).toBe(false);
    expect(tokenMatches('', '')).toBe(false);
  });
});
