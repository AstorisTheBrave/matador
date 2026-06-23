const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validate a user-configured OTLP endpoint. Only http/https are allowed and the
 * value is never derived from request input (SSRF guard, threat T6). Returns the
 * normalized URL string.
 */
export function validateEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(`Matador OTLP endpoint is not a valid URL: ${endpoint}`);
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Matador OTLP endpoint must use http or https, got "${url.protocol}"`);
  }
  return url.toString();
}

/**
 * Resolve the endpoint from an explicit option or the environment. This is the
 * only place in the package that reads the environment (invariant I7).
 */
export function resolveEndpoint(explicit?: string): string {
  const ep = explicit ?? process.env.MATADOR_OTLP_ENDPOINT;
  if (!ep) {
    throw new Error('Matador OTLP requires an endpoint (option or MATADOR_OTLP_ENDPOINT).');
  }
  return validateEndpoint(ep);
}
