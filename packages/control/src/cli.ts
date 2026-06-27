#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { resolveControlConfig, type ControlConfig } from './config.js';
import { ensureSecureBind } from './security.js';
import { StateLock } from './lock.js';
import { AuditLog } from './audit.js';
import { QueueController } from './queues.js';
import { QueueActions } from './actions.js';
import { JobInspector } from './jobs.js';
import { buildControlApp } from './server.js';
import { discoverQueueNames } from './discovery.js';

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function resolveQueueNames(config: ControlConfig, redis: IORedis): Promise<string[]> {
  if (config.queueAllowlist && config.queueAllowlist.length > 0) return config.queueAllowlist;
  return discoverQueueNames(redis);
}

async function run(): Promise<void> {
  const config = resolveControlConfig();
  ensureSecureBind(config);

  const lock = new StateLock(`${config.statePath}.lock`);
  await lock.acquire();

  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const names = await resolveQueueNames(config, connection);
  const queues = new Map(names.map((name) => [name, new Queue(name, { connection })]));
  const audit = new AuditLog(`${config.statePath}.audit.jsonl`);

  const controller = new QueueController(queues, { scrapeCacheTtlMs: 5_000 });
  const actions = new QueueActions(queues, audit);
  const inspector = new JobInspector(queues as never, audit);
  const staticDir = fileURLToPath(new URL('./public', import.meta.url));
  const app = buildControlApp(config, {
    controller,
    actions,
    inspector,
    ping: async () => {
      try {
        await connection.ping();
        return true;
      } catch {
        return false;
      }
    },
    ...(existsSync(staticDir) ? { staticDir } : {}),
  });

  await app.listen({ host: config.host, port: config.port });
  const ui = existsSync(staticDir) ? ' · dashboard at /' : '';
  log(`Matador control plane on http://${config.host}:${config.port} (${names.length} queues)${ui}`);

  const shutdown = (): void => {
    void (async () => {
      await app.close();
      await lock.release();
      await connection.quit();
      process.exit(0);
    })();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function doctor(): Promise<void> {
  const config = resolveControlConfig();
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  try {
    await connection.connect();
    await connection.ping();
    log(`redis: reachable at ${config.redisUrl}`);
    const names = await resolveQueueNames(config, connection);
    log(`queues: ${names.length === 0 ? '(none discovered)' : names.join(', ')}`);
    log(`bind: ${config.host}:${config.port}`);
    log(`auth: viewer=${config.viewerToken ? 'set' : 'unset'} ops=${config.opsToken ? 'set' : 'unset'}`);
  } catch (err) {
    log(`redis: UNREACHABLE (${(err as Error).message})`);
    process.exitCode = 1;
  } finally {
    await connection.quit().catch(() => undefined);
  }
}

const command = process.argv[2];
const task = command === 'doctor' ? doctor() : run();
task.catch((err: unknown) => {
  log(`error: ${(err as Error).message}`);
  process.exit(1);
});
