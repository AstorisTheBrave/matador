import { describe, it, expect, vi } from 'vitest';
import { QueueDepthCollector } from '@matadormq/core';
import { PrometheusSink } from '../src/index.js';

describe('attachQueueDepth', () => {
  it('exposes matador_queue_depth per queue and state at scrape time', async () => {
    const collector = new QueueDepthCollector(5000, () => {});
    collector.register({ name: 'emails', getJobCounts: async () => ({ waiting: 5, active: 2 }) });

    const sink = new PrometheusSink();
    sink.attachQueueDepth(collector);

    const out = await sink.registry.metrics();
    expect(out).toContain('matador_queue_depth{queue="emails",state="waiting"} 5');
    expect(out).toContain('matador_queue_depth{queue="emails",state="active"} 2');
    expect(out).toContain('matador_queue_depth{queue="emails",state="failed"} 0');
  });

  it('reads the collector once per scrape (single-flight at scrape time, I6)', async () => {
    const collector = new QueueDepthCollector(5000, () => {});
    collector.register({ name: 'q', getJobCounts: async () => ({ waiting: 1 }) });
    const snapSpy = vi.spyOn(collector, 'snapshot');

    const sink = new PrometheusSink();
    sink.attachQueueDepth(collector);

    await sink.registry.metrics();
    expect(snapSpy).toHaveBeenCalledTimes(1);
  });

  it('does not leak job-level labels (I5)', async () => {
    const collector = new QueueDepthCollector(5000, () => {});
    collector.register({ name: 'q', getJobCounts: async () => ({ waiting: 1 }) });
    const sink = new PrometheusSink();
    sink.attachQueueDepth(collector);

    const out = await sink.registry.metrics();
    expect(out).not.toMatch(/jobId|userId/);
  });
});
