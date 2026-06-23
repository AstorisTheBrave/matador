import { describe, it, expect } from 'vitest';
import { Queue, Worker, type Job } from 'bullmq';
import { instrument } from '@matadormq/core';
import { PrometheusSink } from '../src/index.js';

const url = process.env.REDIS_URL;
const d = url ? describe : describe.skip;

d('integration: real Redis', () => {
  it('emits processing + completed metrics for a real job', async () => {
    const connection = { url: url! };
    const sink = new PrometheusSink();
    const queueName = `matador-it-${Date.now()}`;
    const worker = new Worker(queueName, async () => 'ok', { connection });
    instrument(worker, { sink });

    const done = new Promise<Job>((res) => worker.on('completed', (j) => res(j)));
    const queue = new Queue(queueName, { connection });
    await queue.add('t', {});
    await done;
    await new Promise((r) => setTimeout(r, 50));

    const out = await sink.registry.metrics();
    expect(out).toContain('matador_jobs_completed_total');

    await worker.close();
    await queue.close();
  }, 20_000);
});
