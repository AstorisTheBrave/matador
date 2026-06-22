import { describe, it, expect, afterEach } from 'vitest';
import { resolveConfig } from '../src/config.js';

const KEYS = ['MATADOR_LABEL_JOB_NAME'];
afterEach(() => KEYS.forEach((k) => delete process.env[k]));

describe('resolveConfig', () => {
  it('uses defaults', () => {
    const c = resolveConfig();
    expect(c.labelJobName).toBe(false);
    expect(c.waitTimeLruSize).toBeGreaterThan(0);
    expect(c.durationBucketsSeconds.length).toBeGreaterThan(0);
  });

  it('env overrides default', () => {
    process.env.MATADOR_LABEL_JOB_NAME = 'true';
    expect(resolveConfig().labelJobName).toBe(true);
  });

  it('kwargs override env', () => {
    process.env.MATADOR_LABEL_JOB_NAME = 'true';
    expect(resolveConfig({ labelJobName: false }).labelJobName).toBe(false);
  });
});
