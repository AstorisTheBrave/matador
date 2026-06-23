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

/** CSP for the dashboard SPA surface (allows self scripts/styles/fonts). */
export const SPA_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'";

/** Whether a request path belongs to the JSON API/probe surface (vs the SPA). */
export function isApiPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return path.startsWith('/api') || path === '/healthz' || path === '/readyz' || path === '/metrics';
}
