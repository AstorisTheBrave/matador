import { describe, it, expect } from 'vitest';
import { generateRules } from '../src/rules.js';

function findAlert(file: ReturnType<typeof generateRules>, name: string) {
  return file.groups.flatMap((g) => g.rules).find((r) => r.alert === name);
}

describe('generateRules', () => {
  it('emits the core alerts with correct expressions and defaults', () => {
    const file = generateRules();
    const failure = findAlert(file, 'MatadorHighFailureRate');
    expect(failure?.expr).toContain('rate(matador_jobs_failed_total[5m])');
    expect(failure?.expr).toContain('> 0.1');

    const backlog = findAlert(file, 'MatadorLargeBacklog');
    expect(backlog?.expr).toBe('matador_queue_depth{state="waiting"} > 1000');

    const slow = findAlert(file, 'MatadorSlowProcessing');
    expect(slow?.expr).toContain('histogram_quantile(0.95');
    expect(slow?.expr).toContain('matador_job_processing_seconds_bucket');
  });

  it('honors namespace and thresholds', () => {
    const file = generateRules({ namespace: 'mq', backlogThreshold: 50 });
    const backlog = findAlert(file, 'MatadorLargeBacklog');
    expect(backlog?.expr).toBe('mq_queue_depth{state="waiting"} > 50');
  });

  it('adds an SLO group only when SLOs are configured', () => {
    expect(generateRules().groups.find((g) => g.name === 'matador.slo')).toBeUndefined();
    const withSlo = generateRules({ slos: [{ waitThresholdSeconds: 30, objective: 0.99 }] });
    expect(withSlo.groups.find((g) => g.name === 'matador.slo')).toBeDefined();
  });
});
