import { timingSafeEqual } from 'node:crypto';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

export function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/**
 * Secure-by-default: refuse to bind to a non-loopback interface without a token.
 * Control paths fail closed (refuse) rather than expose ops actions openly.
 */
export function ensureSecureBind(config: {
  host: string;
  viewerToken: string | undefined;
  opsToken: string | undefined;
}): void {
  if (isLoopback(config.host)) return;
  const hasToken = Boolean(config.viewerToken) || Boolean(config.opsToken);
  if (!hasToken) {
    throw new Error(
      `Matador control plane refuses to bind to a public interface (${config.host}) without a ` +
        `token. Set MATADOR_CONTROL_VIEWER_TOKEN / MATADOR_CONTROL_OPS_TOKEN, or bind to ` +
        `loopback (127.0.0.1) and put it behind a reverse proxy.`,
    );
  }
}

/** Constant-time token comparison. Returns false for empty/undefined expected tokens. */
export function tokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
