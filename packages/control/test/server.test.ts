import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildControlApp, type ControlDeps } from '../src/server.js';
import { resolveControlConfig, type PartialControlConfig } from '../src/config.js';
import { ConfirmRequiredError } from '../src/errors.js';

const counts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
  paused: 0,
  prioritized: 0,
  'waiting-children': 0,
} as const;

function deps(over: Partial<ControlDeps> = {}): ControlDeps {
  return {
    controller: {
      list: async () => [{ name: 'emails', counts: { ...counts } }],
      detail: async (name: string) =>
        name === 'emails' ? { name, counts: { ...counts }, dlqSample: [] } : undefined,
    } as unknown as ControlDeps['controller'],
    actions: {
      pause: async () => ({ paused: true }),
      resume: async () => ({ paused: false }),
      retryFailed: async () => ({ retried: 0 }),
      drainDlq: async (name: string, _actor: string, confirm: string) => {
        if (confirm !== name) throw new ConfirmRequiredError(name);
        return { removed: 0 };
      },
    } as unknown as ControlDeps['actions'],
    ping: async () => true,
    ...over,
  };
}

const cfg = (over: PartialControlConfig = {}) => resolveControlConfig(over);

describe('control server (loopback dev, no tokens)', () => {
  it('serves views and ops openly and sends security headers', async () => {
    const app = buildControlApp(cfg(), deps());
    const list = await app.inject({ method: 'GET', url: '/api/queues' });
    expect(list.statusCode).toBe(200);
    expect(list.headers['x-content-type-options']).toBe('nosniff');
    expect(list.json().items[0].name).toBe('emails');

    const pause = await app.inject({ method: 'POST', url: '/api/queues/emails/pause' });
    expect(pause.statusCode).toBe(200);
    await app.close();
  });
});

describe('control server (tokens configured)', () => {
  const config = cfg({ viewerToken: 'v', opsToken: 'o' });

  it('enforces the auth matrix', async () => {
    const app = buildControlApp(config, deps());
    const v = { authorization: 'Bearer v' };
    const o = { authorization: 'Bearer o' };

    expect((await app.inject({ method: 'GET', url: '/api/queues' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/queues', headers: v })).statusCode).toBe(200);

    expect((await app.inject({ method: 'POST', url: '/api/queues/emails/pause' })).statusCode).toBe(401);
    // viewer token cannot perform ops actions
    expect(
      (await app.inject({ method: 'POST', url: '/api/queues/emails/pause', headers: v })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/api/queues/emails/pause', headers: o })).statusCode,
    ).toBe(200);
    await app.close();
  });

  it('404 for unknown queue, 400 for drain without confirm, 200 with confirm', async () => {
    const app = buildControlApp(config, deps());
    const o = { authorization: 'Bearer o' };

    expect((await app.inject({ method: 'GET', url: '/api/queues/nope', headers: { authorization: 'Bearer v' } })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: '/api/queues/emails/drain-dlq', headers: o, payload: {} })).statusCode,
    ).toBe(400);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/queues/emails/drain-dlq',
      headers: o,
      payload: { confirm: 'emails' },
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });
});

describe('control server (limits and probes)', () => {
  it('413 when the body exceeds the cap', async () => {
    const app = buildControlApp(cfg({ maxBodyBytes: 16 }), deps());
    const res = await app.inject({
      method: 'POST',
      url: '/api/queues/emails/retry-failed',
      payload: { limit: 'x'.repeat(100) },
    });
    expect(res.statusCode).toBe(413);
    await app.close();
  });

  it('429 when the ops rate limit is exhausted', async () => {
    const app = buildControlApp(cfg(), deps({ rateLimits: { ops: { capacity: 1, refillPerSec: 0 } } }));
    expect((await app.inject({ method: 'POST', url: '/api/queues/emails/pause' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/queues/emails/pause' })).statusCode).toBe(429);
    await app.close();
  });

  it('readyz reflects the ping probe', async () => {
    const up = buildControlApp(cfg(), deps({ ping: async () => true }));
    expect((await up.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
    await up.close();
    const down = buildControlApp(cfg(), deps({ ping: async () => false }));
    expect((await down.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503);
    expect((await down.inject({ method: 'GET', url: '/metrics' })).body).toContain('matador_subsystem_up 1');
    await down.close();
  });
});

describe('control server (static dashboard)', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('serves the SPA at / with the SPA CSP, and the API CSP stays strict', async () => {
    dir = await mkdtemp(join(tmpdir(), 'matador-spa-'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Matador</title>', 'utf8');
    const app = buildControlApp(cfg(), deps({ staticDir: dir }));

    const spa = await app.inject({ method: 'GET', url: '/' });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('Matador');
    expect(spa.headers['content-security-policy']).toContain("default-src 'self'");

    // A client-side route falls back to index.html.
    const route = await app.inject({ method: 'GET', url: '/some/spa/route' });
    expect(route.statusCode).toBe(200);

    // The JSON API keeps the strict CSP and still works.
    const api = await app.inject({ method: 'GET', url: '/api/queues' });
    expect(api.statusCode).toBe(200);
    expect(api.headers['content-security-policy']).toContain("default-src 'none'");
    await app.close();
  });
});
