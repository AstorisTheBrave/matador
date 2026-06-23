import { Queue, Worker } from 'bullmq';
import Fastify from 'fastify';
import { instrument, MultiSink } from '@matador/core';
import { PrometheusSink, metricsPlugin } from '@matador/prometheus';
import { OtlpSink } from '@matador/otlp';

const connection = { host: '127.0.0.1', port: 6379 };

// Export to Prometheus AND OpenTelemetry at the same time.
const prom = new PrometheusSink();
const otlp = new OtlpSink({ endpoint: 'http://localhost:4318/v1/metrics' });
const sink = new MultiSink([prom, otlp]);

const worker = new Worker(
  'emails',
  async (job) => {
    await job.log('sent');
  },
  { connection },
);
instrument(worker, { sink });

const queue = new Queue('emails', { connection });
const queueReg = instrument(queue, { sink });
prom.attachQueueDepth(queueReg.depthCollector); // depth gauges via Prometheus

const app = Fastify();
metricsPlugin(app, prom);
await app.listen({ port: 3000 });

await queue.add('send-email', { to: 'a@b.c' });

console.log('Matador OTLP example: Prometheus /metrics on :3000, OTLP to :4318');
