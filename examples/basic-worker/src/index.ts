import { Queue, Worker } from 'bullmq';
import Fastify from 'fastify';
import { instrument } from '@matadormq/core';
import { PrometheusSink, metricsPlugin } from '@matadormq/prometheus';

const connection = { host: '127.0.0.1', port: 6379 };
const sink = new PrometheusSink();

const worker = new Worker(
  'emails',
  async (job) => {
    await job.log('sent');
  },
  { connection },
);

instrument(worker, { sink }); // <-- the whole integration

const app = Fastify();
metricsPlugin(app, sink);
await app.listen({ port: 3000 });
// metrics now live at http://localhost:3000/metrics

const queue = new Queue('emails', { connection });

// Expose live queue-depth gauges (waiting/active/delayed/...) at scrape time.
const queueReg = instrument(queue, { sink });
sink.attachQueueDepth(queueReg.depthCollector);

await queue.add('send-email', { to: 'a@b.c' });

console.log('Matador example running. Scrape http://localhost:3000/metrics');
