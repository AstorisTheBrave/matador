import { describe, it, expect, afterEach } from 'vitest';
import { resolveControlConfig } from '../src/config.js';

const KEYS = [
  'MATADOR_CONTROL_HOST',
  'MATADOR_CONTROL_PORT',
  'MATADOR_CONTROL_VIEWER_TOKEN',
  'MATADOR_CONTROL_OPS_TOKEN',
  'MATADOR_CONTROL_QUEUE_ALLOWLIST',
];
afterEach(() => KEYS.forEach((k) => delete process.env[k]));

describe('resolveControlConfig', () => {
  it('uses defaults (loopback, no tokens)', () => {
    const c = resolveControlConfig();
    expect(c.host).toBe('127.0.0.1');
    expect(c.viewerToken).toBeUndefined();
    expect(c.maxBodyBytes).toBeGreaterThan(0);
  });

  it('reads env', () => {
    process.env.MATADOR_CONTROL_HOST = '0.0.0.0';
    process.env.MATADOR_CONTROL_PORT = '9999';
    process.env.MATADOR_CONTROL_VIEWER_TOKEN = 'v';
    process.env.MATADOR_CONTROL_QUEUE_ALLOWLIST = 'emails, sms ,';
    const c = resolveControlConfig();
    expect(c.host).toBe('0.0.0.0');
    expect(c.port).toBe(9999);
    expect(c.viewerToken).toBe('v');
    expect(c.queueAllowlist).toEqual(['emails', 'sms']);
  });

  it('kwargs override env', () => {
    process.env.MATADOR_CONTROL_HOST = '0.0.0.0';
    expect(resolveControlConfig({ host: '127.0.0.1' }).host).toBe('127.0.0.1');
  });
});
