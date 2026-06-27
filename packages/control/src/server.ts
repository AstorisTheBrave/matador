import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Counter, Gauge, Registry } from 'prom-client';
import type { ControlConfig } from './config.js';
import type { QueueController } from './queues.js';
import type { QueueActions } from './actions.js';
import type { JobInspector } from './jobs.js';
import type { Alert } from './notifier.js';
import type { MonitorConfig } from './monitors.js';
import type { ConnectionRegistry } from './connections.js';
import { isApiPath, securityHeaders, SPA_CSP } from './http.js';
import { KeyedRateLimiter, type RateLimiterOptions } from './ratelimit.js';
import { tokenMatches } from './security.js';
import { clampPageSize, paginate } from './views.js';
import { ConfirmRequiredError, UnknownQueueError } from './errors.js';

interface ConnectionView {
  controller: QueueController;
  actions: QueueActions;
  inspector: JobInspector | undefined;
}

export interface ControlDeps {
  controller: QueueController;
  actions: QueueActions;
  /** Redis readiness probe. */
  ping: () => Promise<boolean>;
  /** Optional job inspector (jobs list/detail/logs + per-job actions). */
  inspector?: JobInspector;
  /** Optional multiple named connections (selected with ?connection=). */
  connections?: ConnectionRegistry;
  /** Optional live monitors: current firing alerts + their config. */
  monitors?: { current(): Alert[]; config: MonitorConfig };
  /** Optional alert history reader. */
  alerts?: { readAll(limit?: number): Promise<Alert[]> };
  rateLimits?: { viewer?: RateLimiterOptions; ops?: RateLimiterOptions };
  /** Directory of the built dashboard SPA to serve. Omit to run API-only. */
  staticDir?: string;
}

const DEFAULT_VIEWER_RL: RateLimiterOptions = { capacity: 120, refillPerSec: 10 };
const DEFAULT_OPS_RL: RateLimiterOptions = { capacity: 20, refillPerSec: 1 };
const ALLOWED_REDIS_SCHEMES = new Set(['redis:', 'rediss:']);

function validateRedisUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('redis URL is not valid');
  }
  if (!ALLOWED_REDIS_SCHEMES.has(u.protocol)) throw new Error('redis URL must use redis:// or rediss://');
  return url;
}

export function buildControlApp(config: ControlConfig, deps: ControlDeps): FastifyInstance {
  const app = Fastify({ bodyLimit: config.maxBodyBytes, logger: false });

  const registry = new Registry();
  const requests = new Counter({
    name: 'matador_control_requests_total',
    help: 'Control API requests by route and status.',
    labelNames: ['route', 'status'],
    registers: [registry],
  });
  const actionCounter = new Counter({
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

  const anyToken = Boolean(config.viewerToken) || Boolean(config.opsToken) || Boolean(config.adminToken);
  const bearer = (req: FastifyRequest): string | undefined => {
    const h = req.headers.authorization;
    return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : undefined;
  };
  // Loopback dev with no tokens is permitted (ensureSecureBind guarantees a token
  // off loopback). admin >= ops >= viewer.
  const authViewer = (req: FastifyRequest): boolean =>
    !anyToken ||
    tokenMatches(bearer(req), config.viewerToken) ||
    tokenMatches(bearer(req), config.opsToken) ||
    tokenMatches(bearer(req), config.adminToken);
  const authOps = (req: FastifyRequest): boolean =>
    !anyToken || tokenMatches(bearer(req), config.opsToken) || tokenMatches(bearer(req), config.adminToken);
  const authAdmin = (req: FastifyRequest): boolean =>
    !anyToken || tokenMatches(bearer(req), config.adminToken);

  const defaultSet: ConnectionView = {
    controller: deps.controller,
    actions: deps.actions,
    inspector: deps.inspector,
  };
  /** Resolve the connection for a request (?connection=id); null = unknown id. */
  const setOf = (req: FastifyRequest): ConnectionView | null => {
    const id = (req.query as { connection?: string }).connection;
    if (deps.connections === undefined || id === undefined || id === '') return defaultSet;
    const set = deps.connections.get(id);
    return set ? { controller: set.controller, actions: set.actions, inspector: set.inspector } : null;
  };
  const unknownConnection = (reply: FastifyReply) => reply.code(404).send({ error: 'unknown_connection' });

  app.addHook('onSend', async (req, reply, payload) => {
    for (const [k, v] of Object.entries(securityHeaders())) reply.header(k, v);
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

  // Connections: list (viewer), add/remove (admin, runtime, if enabled).
  app.get('/api/connections', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const list = deps.connections
      ? deps.connections.list()
      : [{ id: 'default', redisUrl: '(default)', isDefault: true }];
    return reply.send({ connections: list });
  });
  app.post('/api/connections', async (req, reply) => {
    if (rateLimited(req, reply, opsLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    if (!authAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
    if (!deps.connections) return reply.code(501).send({ error: 'connections_disabled' });
    const body = req.body as { id?: string; redisUrl?: string } | undefined;
    if (!body?.id || !body.redisUrl) return reply.code(400).send({ error: 'id_and_redisUrl_required' });
    try {
      await deps.connections.add(body.id, validateRedisUrl(body.redisUrl));
      return reply.code(201).send({ ok: true });
    } catch (err) {
      return reply.code(400).send({ error: 'invalid', message: (err as Error).message });
    }
  });
  app.delete('/api/connections/:id', async (req, reply) => {
    if (rateLimited(req, reply, opsLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    if (!authAdmin(req)) return reply.code(403).send({ error: 'forbidden' });
    if (!deps.connections) return reply.code(501).send({ error: 'connections_disabled' });
    const { id } = req.params as { id: string };
    try {
      const removed = await deps.connections.remove(id);
      return removed ? reply.send({ ok: true }) : reply.code(404).send({ error: 'unknown_connection' });
    } catch (err) {
      return reply.code(400).send({ error: 'invalid', message: (err as Error).message });
    }
  });

  app.get('/api/queues', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const set = setOf(req);
    if (!set) return unknownConnection(reply);
    const q = req.query as { page?: string; pageSize?: string };
    const list = await set.controller.list();
    const pageSize = clampPageSize(q.pageSize ? Number(q.pageSize) : undefined, 25, 100);
    requests.inc({ route: 'queues', status: '200' });
    return reply.send(paginate(list, q.page ? Number(q.page) : 1, pageSize));
  });

  app.get('/api/queues/:name', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const set = setOf(req);
    if (!set) return unknownConnection(reply);
    const { name } = req.params as { name: string };
    const detail = await set.controller.detail(name);
    if (!detail) return reply.code(404).send({ error: 'unknown_queue' });
    return reply.send(detail);
  });

  app.get('/api/queues/:name/dlq/analytics', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const set = setOf(req);
    if (!set) return unknownConnection(reply);
    const { name } = req.params as { name: string };
    const analytics = await set.controller.dlqAnalytics(name);
    if (!analytics) return reply.code(404).send({ error: 'unknown_queue' });
    return reply.send(analytics);
  });

  app.get('/api/queues/:name/workers', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const set = setOf(req);
    if (!set) return unknownConnection(reply);
    const { name } = req.params as { name: string };
    const workers = await set.controller.workers(name);
    if (!workers) return reply.code(404).send({ error: 'unknown_queue' });
    return reply.send({ workers });
  });

  app.get('/api/queues/:name/metrics', async (req, reply) => {
    if (rateLimited(req, reply, viewerLimiter)) return;
    if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
    const set = setOf(req);
    if (!set) return unknownConnection(reply);
    const { name } = req.params as { name: string };
    const type = (req.query as { type?: string }).type === 'failed' ? 'failed' : 'completed';
    const metrics = await set.controller.metrics(name, type);
    if (!metrics) return reply.code(404).send({ error: 'unknown_queue' });
    return reply.send(metrics);
  });

  const opsHandler =
    (action: string, run: (actions: QueueActions, name: string, req: FastifyRequest) => Promise<unknown>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (rateLimited(req, reply, opsLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      if (!authOps(req)) return reply.code(403).send({ error: 'forbidden' });
      const set = setOf(req);
      if (!set) return unknownConnection(reply);
      const { name } = req.params as { name: string };
      try {
        const result = await run(set.actions, name, req);
        actionCounter.inc({ action });
        return reply.send(result);
      } catch (err) {
        if (err instanceof UnknownQueueError) return reply.code(404).send({ error: err.code });
        if (err instanceof ConfirmRequiredError)
          return reply.code(400).send({ error: err.code, message: err.message });
        return reply.code(500).send({ error: 'internal' });
      }
    };

  app.post('/api/queues/:name/pause', opsHandler('pause', (a, name) => a.pause(name, 'ops')));
  app.post('/api/queues/:name/resume', opsHandler('resume', (a, name) => a.resume(name, 'ops')));
  app.post(
    '/api/queues/:name/retry-failed',
    opsHandler('retry-failed', (a, name, req) =>
      a.retryFailed(name, 'ops', (req.body as { limit?: number } | undefined)?.limit),
    ),
  );
  app.post(
    '/api/queues/:name/drain-dlq',
    opsHandler('drain-dlq', (a, name, req) =>
      a.drainDlq(name, 'ops', String((req.body as { confirm?: string } | undefined)?.confirm ?? '')),
    ),
  );

  if (deps.monitors !== undefined) {
    const monitors = deps.monitors;
    app.get('/api/monitors', async (req, reply) => {
      if (rateLimited(req, reply, viewerLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      return reply.send({ config: monitors.config, active: monitors.current() });
    });
  }
  if (deps.alerts !== undefined) {
    const alertReader = deps.alerts;
    app.get('/api/alerts', async (req, reply) => {
      if (rateLimited(req, reply, viewerLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      return reply.send({ alerts: await alertReader.readAll() });
    });
  }

  // Job inspector: list/detail/logs/tree (viewer) + retry/remove/promote (ops).
  if (deps.inspector !== undefined || deps.connections !== undefined) {
    const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'not_found' });
    const inspectorOf = (req: FastifyRequest): JobInspector | null | undefined => {
      const set = setOf(req);
      if (!set) return null; // unknown connection
      return set.inspector;
    };

    app.get('/api/queues/:name/jobs', async (req, reply) => {
      if (rateLimited(req, reply, viewerLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      const insp = inspectorOf(req);
      if (insp === null) return unknownConnection(reply);
      if (!insp) return notFound(reply);
      const { name } = req.params as { name: string };
      const q = req.query as { state?: string; page?: string; pageSize?: string };
      try {
        return reply.send(
          await insp.list(name, q.state ?? 'failed', q.page ? Number(q.page) : 1, q.pageSize ? Number(q.pageSize) : 25),
        );
      } catch (err) {
        if (err instanceof UnknownQueueError) return notFound(reply);
        throw err;
      }
    });

    app.get('/api/queues/:name/jobs/:id', async (req, reply) => {
      if (rateLimited(req, reply, viewerLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      const insp = inspectorOf(req);
      if (insp === null) return unknownConnection(reply);
      if (!insp) return notFound(reply);
      const { name, id } = req.params as { name: string; id: string };
      try {
        const job = await insp.get(name, id);
        return job ? reply.send(job) : notFound(reply);
      } catch (err) {
        if (err instanceof UnknownQueueError) return notFound(reply);
        throw err;
      }
    });

    app.get('/api/queues/:name/jobs/:id/tree', async (req, reply) => {
      if (rateLimited(req, reply, viewerLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      const insp = inspectorOf(req);
      if (insp === null) return unknownConnection(reply);
      if (!insp) return notFound(reply);
      const { name, id } = req.params as { name: string; id: string };
      try {
        const tree = await insp.tree(name, id);
        return tree ? reply.send(tree) : notFound(reply);
      } catch (err) {
        if (err instanceof UnknownQueueError) return notFound(reply);
        throw err;
      }
    });

    app.get('/api/queues/:name/jobs/:id/logs', async (req, reply) => {
      if (rateLimited(req, reply, viewerLimiter)) return;
      if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
      const insp = inspectorOf(req);
      if (insp === null) return unknownConnection(reply);
      if (!insp) return notFound(reply);
      const { name, id } = req.params as { name: string; id: string };
      const q = req.query as { page?: string };
      try {
        return reply.send(await insp.logs(name, id, q.page ? Number(q.page) : 1));
      } catch (err) {
        if (err instanceof UnknownQueueError) return notFound(reply);
        throw err;
      }
    });

    const jobAction = (action: 'retry' | 'remove' | 'promote') =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        if (rateLimited(req, reply, opsLimiter)) return;
        if (!authViewer(req)) return reply.code(401).send({ error: 'unauthorized' });
        if (!authOps(req)) return reply.code(403).send({ error: 'forbidden' });
        const insp = inspectorOf(req);
        if (insp === null) return unknownConnection(reply);
        if (!insp) return notFound(reply);
        const { name, id } = req.params as { name: string; id: string };
        try {
          const result = await insp[action](name, id, 'ops');
          if (!result.ok) return notFound(reply);
          actionCounter.inc({ action: `${action}-job` });
          return reply.send(result);
        } catch (err) {
          if (err instanceof UnknownQueueError) return notFound(reply);
          throw err;
        }
      };
    app.post('/api/queues/:name/jobs/:id/retry', jobAction('retry'));
    app.post('/api/queues/:name/jobs/:id/remove', jobAction('remove'));
    app.post('/api/queues/:name/jobs/:id/promote', jobAction('promote'));
  }

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
