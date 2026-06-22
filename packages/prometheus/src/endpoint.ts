import type { FastifyInstance } from 'fastify';
import type { PrometheusSink } from './index.js';

/** Register a GET /metrics route serving the sink's Prometheus exposition. */
export function metricsPlugin(app: FastifyInstance, sink: PrometheusSink, path = '/metrics'): void {
  app.get(path, async (_req, reply) => {
    reply.header('Content-Type', sink.registry.contentType);
    return sink.registry.metrics();
  });
}
