import { describe, it, expect } from 'vitest';
import { securityHeaders, sanitizeLogValue } from '../src/http.js';

describe('securityHeaders', () => {
  it('includes the hardening headers and a strict CSP', () => {
    const h = securityHeaders();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['Content-Security-Policy']).toContain("default-src 'none'");
  });
});

describe('sanitizeLogValue', () => {
  it('strips CR/LF and truncates (log injection guard)', () => {
    expect(sanitizeLogValue('a\nb\rc')).toBe('a b c');
    expect(sanitizeLogValue('x'.repeat(500)).length).toBeLessThanOrEqual(200);
  });
});
