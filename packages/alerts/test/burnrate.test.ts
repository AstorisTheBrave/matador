import { describe, it, expect } from 'vitest';
import { generateBurnRateRules } from '../src/burnrate.js';

describe('generateBurnRateRules', () => {
  it('emits fast and slow multi-window pairs per SLO', () => {
    const group = generateBurnRateRules([{ waitThresholdSeconds: 30, objective: 0.99 }]);
    expect(group.name).toBe('matador.slo');
    const fast = group.rules.find((r) => r.alert.startsWith('MatadorWaitSLOFastBurn'));
    const slow = group.rules.find((r) => r.alert.startsWith('MatadorWaitSLOSlowBurn'));

    // Fast: 1h and 5m windows, 14.4x budget (eb = 0.01 -> 0.144).
    expect(fast?.expr).toContain('[1h]');
    expect(fast?.expr).toContain('[5m]');
    expect(fast?.expr).toContain('le="30"');
    expect(fast?.expr).toContain('> 0.144');
    expect(fast?.labels?.severity).toBe('critical');

    // Slow: 6h and 30m windows, 6x budget (-> 0.0600).
    expect(slow?.expr).toContain('[6h]');
    expect(slow?.expr).toContain('[30m]');
    expect(slow?.expr).toContain('> 0.0600');
  });

  it('scopes to a queue and suffixes the alert name', () => {
    const group = generateBurnRateRules([{ queue: 'emails', waitThresholdSeconds: 10, objective: 0.99 }]);
    const fast = group.rules.find((r) => r.alert === 'MatadorWaitSLOFastBurn:emails');
    expect(fast?.expr).toContain('queue="emails"');
  });
});
