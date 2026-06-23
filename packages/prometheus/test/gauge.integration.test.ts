import { describe, it, expect } from 'vitest';
import { Queue } from 'bullmq';
import { QueueDepthCollector } from '@matador/core';
import { PrometheusSink } from '../src/index.js';

const url = process.env.REDIS_URL;
const d = url ? describe : describe.skip;

d('integration: queue-depth gauge against real Redis', () => {
  it('reflects waiting jobs from a real queue', async () => {
    const connection = { url: url! };
    const queueName = `matador-depth-${Date.now()}`;
    const queue = new Queue(queueName, { connection });
    await queue.waitUntilReady();
    await queue.add('t', {});
    await queue.add('t', {});

    const collector = new QueueDepthCollector(0, () => {}); // ttl 0: always fresh in the test
    collector.register(queue as never);
    const sink = new PrometheusSink();
    sink.attachQueueDepth(collector);

    const out = await sink.registry.metrics();
    expect(out).toMatch(
      new RegExp(`matador_queue_depth\\{queue="${queueName}",state="waiting"\\} 2`),
    );

    await queue.obliterate({ force: true });
    await queue.close();
  }, 20_000);
});
