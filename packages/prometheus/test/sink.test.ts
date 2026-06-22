import { describe, it, expect } from 'vitest';
import { Registry } from 'prom-client';
import { PrometheusSink } from '../src/index.js';

describe('PrometheusSink', () => {
  it('exposes histograms and counters in exposition format', async () => {
    const reg = new Registry();
    const sink = new PrometheusSink({ registry: reg });
    sink.observeProcessingSeconds({ queue: 'emails' }, 0.5);
    sink.observeWaitSeconds({ queue: 'emails' }, 0.2);
    sink.incCompleted({ queue: 'emails' });
    const out = await reg.metrics();
    expect(out).toContain('matador_job_processing_seconds');
    expect(out).toContain('matador_job_wait_seconds');
    expect(out).toContain('matador_jobs_completed_total');
    expect(out).toContain('queue="emails"');
  });

  it('only uses queue/name labels (I5)', async () => {
    const reg = new Registry();
    const sink = new PrometheusSink({ registry: reg });
    sink.incCompleted({ queue: 'emails', name: 'send' });
    const out = await reg.metrics();
    expect(out).toContain('name="send"');
    expect(out).not.toMatch(/jobId|userId/);
  });

  it('increments the self-health error counter', async () => {
    const reg = new Registry();
    const sink = new PrometheusSink({ registry: reg });
    sink.incInstrumentationError();
    const out = await reg.metrics();
    expect(out).toContain('matador_instrumentation_errors_total 1');
  });
});
