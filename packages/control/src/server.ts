import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Counter, Gauge, Registry } from 'prom-client';
import type { ControlConfig } from './config.js';
import type { QueueController } from './queues.js';
import type { QueueActions } from './actions.js';
import { isApiPath, securityHeaders, SPA_CSP } from './http.js';
import { KeyedRateLimiter, type RateLimiterOptions } from './ratelimit.js';
import { tokenMatches } from './security.js';
import { clampPageSize, paginate } from './views.js';
import { ConfirmRequiredError, UnknownQueueError } from './errors.js';

export interface ControlDeps {
  controller: QueueController;
  actions: QueueActions;
  /** Redis readiness probe. */
  ping: () => Promise<boolean>;
  rateLimits?: { viewer?: RateLimiterOptions; ops?: RateLimiterOptions };
  /** Directory of the built dashboard SPA to serve. Omit to run API-only. */
  staticDir?: string;
}

const DEFAULT_VIEWER_RL: RateLimiterOptions = { capacity: 120, refillPerSec: 10 };
const DEFAULT_OPS_RL: RateLimiterOptions = { capacity: 20, refillPerSec: 1 };

export function buildControlApp(config: ControlConfig, deps: ControlDeps): FastifyInstance {
  const app = Fastify({ bodyLimit: config.maxBodyBytes, logger: false });

  const registry = new Registry();
  const requests = new Counter({
    name: 'matador_control_requests_total',
    help: 'Control API requests by route and status.',
    labelNames: ['route', 'status'],
    registers: [registry],
  });
  const actions = new Counter({
    name: 'matador_control_actions_total',
    help: 'Operational actions performed.',
    labelNames: ['action'],
    registers: [registry],
  });
  new Gauge({
    name: 'matador_subsystem_up',
    help: 'Control plane self-health (1 = up).',
    registers: [registry],
  }).set(1);

  const viewerLimiter = new KeyedRateLimiter(deps.rateLimits?.viewer ?? DEFAULT_VIEWER_RL);
  const opsLimiter = new KeyedRateLimiter(deps.rateLimits?.ops ?? DEFAULT_OPS_RL);

  const anyToken = Boolean(config.viewerToken) || Boolean(config.opsToken);
  const bearer = (req: FastifyRequest): string | undefined => {
    const h = req.headers.authorization;
    return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : undefined;
  };
  // Loopback dev with no tokens is permitted (ensureSecureBind guarantees a token
  // off loopback). A viewer is satisfied by either token; ops requires the ops token.
  const authViewer = (req: FastifyRequest): boolean =>
    !anyToken || tokenMatches(bearer(req), config.viewerToken) || tokenMatches(bearer(req), config.opsToken);
  const authOps = (req: FastifyRequest): boolean =>
    !anyToken || tokenMatches(bearer(req), config.opsToken);

  app.addHook('onSend', async (req, reply, payload) => {
    for (const [k, v] of Object.entries(securityHeaders())) reply.header(k, v);
    // The SPA needs to load its own scripts/styles/fonts; the API stays strict.
    if (!isApiPath(req.url)) reply.header('Content-Security-Policy', SPA_CSP);
    return payload;
  });

  const rateLimited = (req: FastifyRequest, reply: FastifyReply, limiter: KeyedRateLimiter): boolean => {
    if (limiter.tryRemove(req.ip)) return false;
    reply.code(429).send({ error: 'rate_limited' });
    return true;
  };

  app.get('/healthz', async () => ({ ok: true }));

  app.get('/readyz', async (_req, reply) => {
    const ok = await deps.ping().catch(() => false);
    return reply.code(ok ? 200 : 503).send({ ready: ok });
  });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  app.get('/api/queues', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const q = req.query as { page?: string; pageSize?: string };
    const list = await deps.controller.list();
    const pageSize = clampPageSize(q.pageSize ? Number(q.pageSize) : undefined, 25, 100);
    requests.inc({ route: 'queues', status: '200' });
    return reply.send(paginate(list, q.page ? Number(q.page) : 1, pageSize));
  });

  app.get('/api/queues/:name', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { name } = req.params as { name: string };
    const detail = await deps.controller.detail(name);
    if (!detail) return reply.code(404).send({ error: 'unknown_queue' });
    return reply.send(detail);
  });

  app.get('/api/queues/:name/dlq/analytics', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { name } = req.params as { name: string };
    const analytics = await deps.controller.dlqAnalytics(name);
    if (!analytics) return reply.code(404).send({ error: 'unknown_queue' });
    return reply.send(analytics);
  });

  const opsHandler =
    (action: string, run: (name: string, req: FastifyRequest) => Promise<unknown>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (rateLimited(req, reply, opsLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      if (!authOps(req)) return reply.code(403).send({ error: 'forbidden' });
      const { name } = req.params as { name: string };
      try {
        const result = await run(name, req);
        actions.inc({ action });
        return reply.send(result);
      } catch (err) {
        if (err instanceof UnknownQueueError) return reply.code(404).send({ error: err.code });
        if (err instanceof ConfirmRequiredError)
          return reply.code(400).send({ error: err.code, message: err.message });
        return reply.code(500).send({ error: 'internal' });
      }
    };

  app.post('/api/queues/:name/pause', opsHandler('pause', (name) => deps.actions.pause(name, 'ops')));
  app.post('/api/queues/:name/resume', opsHandler('resume', (name) => deps.actions.resume(name, 'ops')));
  app.post(
    '/api/queues/:name/retry-failed',
    opsHandler('retry-failed', (name, req) =>
      deps.actions.retryFailed(name, 'ops', (req.body as { limit?: number } | undefined)?.limit),
    ),
  );
  app.post(
    '/api/queues/:name/drain-dlq',
    opsHandler('drain-dlq', (name, req) =>
      deps.actions.drainDlq(name, 'ops', String((req.body as { confirm?: string } | undefined)?.confirm ?? '')),
    ),
  );

  // Serve the dashboard SPA (open: it carries no data; the API behind it is gated).
  if (deps.staticDir !== undefined) {
    void app.register(fastifyStatic, { root: deps.staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !isApiPath(req.url)) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
