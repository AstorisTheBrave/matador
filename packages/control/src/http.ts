/** Hardening headers for the control-plane API surface. */
export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };
}

/**
 * Make an untrusted value (queue/job name) safe to write to a log: strip CR/LF
 * (log injection) and bound the length.
 */
export function sanitizeLogValue(value: string, max = 200): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, max);
}
