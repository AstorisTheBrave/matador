import { describe, it, expect, afterEach } from 'vitest';
import { validateEndpoint, resolveEndpoint } from '../src/config.js';

afterEach(() => delete process.env.MATADOR_OTLP_ENDPOINT);

describe('validateEndpoint', () => {
  it('accepts http and https URLs', () => {
    expect(validateEndpoint('http://collector:4318/v1/metrics')).toContain('http://collector:4318');
    expect(validateEndpoint('https://otel.example.com/v1/metrics')).toContain('https://');
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => validateEndpoint('file:///etc/passwd')).toThrow(/http or https/);
    expect(() => validateEndpoint('gopher://x')).toThrow(/http or https/);
  });

  it('rejects garbage and empty input', () => {
    expect(() => validateEndpoint('not a url')).toThrow(/not a valid URL/);
    expect(() => validateEndpoint('')).toThrow(/not a valid URL/);
  });
});

describe('resolveEndpoint', () => {
  it('prefers the explicit option', () => {
    process.env.MATADOR_OTLP_ENDPOINT = 'http://env:4318';
    expect(resolveEndpoint('http://explicit:4318')).toContain('explicit');
  });
  it('falls back to the environment', () => {
    process.env.MATADOR_OTLP_ENDPOINT = 'http://env:4318';
    expect(resolveEndpoint()).toContain('env');
  });
  it('throws when neither is set', () => {
    expect(() => resolveEndpoint()).toThrow(/requires an endpoint/);
  });
});
