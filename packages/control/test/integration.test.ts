import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
import { discoverQueueNames } from '../src/discovery.js';
import { QueueController } from '../src/queues.js';
import { QueueActions } from '../src/actions.js';
import { AuditLog } from '../src/audit.js';
import { buildControlApp } from '../src/server.js';
import { resolveControlConfig } from '../src/config.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.env.REDIS_URL;
const d = url ? describe : describe.skip;

d('control integration: real Redis', () => {
  it('discovers, views, retries and drains a real failed queue, auditing each action', async () => {
    const connection = { url: url! };
    const name = `matador-it-control-${Date.now()}`;

    // Produce one failed job.
    const worker = new Worker(
      name,
      async () => {
        throw new Error('boom');
      },
      { connection },
    );
    const failed = new Promise<Job>((res) => worker.on('failed', (j) => j && res(j)));
    const queue = new Queue(name, { connection });
    await queue.add('t', { secret: 'pii' }, { attempts: 1 });
    await failed;
    await new Promise((r) => setTimeout(r, 50));

    // Discovery finds the queue.
    const raw = new IORedis(url!);
    const names = await discoverQueueNames(raw);
    expect(names).toContain(name);

    const dir = await mkdtemp(join(tmpdir(), 'matador-it-'));
    const audit = new AuditLog(join(dir, 'audit.jsonl'));
    const queues = new Map([[name, queue]]);
    const controller = new QueueController(queues as never, { scrapeCacheTtlMs: 0 });
    const actions = new QueueActions(queues as never, audit);
    const app = buildControlApp(resolveControlConfig(), {
      controller,
      actions,
      ping: async () => true,
    });

    // View: failed count = 1, sample present, payload stripped.
    const detail = (await app.inject({ method: 'GET', url: `/api/queues/${name}` })).json();
    expect(detail.counts.failed).toBe(1);
    expect(detail.dlqSample).toHaveLength(1);
    expect(JSON.stringify(detail.dlqSample)).not.toContain('pii');

    // retry-failed moves it back; then drain-dlq with confirm clears it.
    const retry = await app.inject({ method: 'POST', url: `/api/queues/${name}/retry-failed` });
    expect(retry.statusCode).toBe(200);

    const drain = await app.inject({
      method: 'POST',
      url: `/api/queues/${name}/drain-dlq`,
      payload: { confirm: name },
    });
    expect(drain.statusCode).toBe(200);

    const log = await audit.readAll();
    expect(log.some((e) => e.action === 'retry-failed')).toBe(true);
    expect(log.some((e) => e.action === 'drain-dlq')).toBe(true);

    await app.close();
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await raw.quit();
    await rm(dir, { recursive: true, force: true });
  }, 30_000);
});
