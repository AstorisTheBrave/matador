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
import { AlertLog, MonitorEngine, type MonitorContext } from './monitors.js';
import { PagerDutyNotifier, SlackNotifier, WebhookNotifier, type Notifier } from './notifier.js';

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

  // Live monitors + notifications.
  const notifiers: Notifier[] = [];
  if (config.slackWebhook) notifiers.push(new SlackNotifier(config.slackWebhook));
  if (config.pagerDutyKey) notifiers.push(new PagerDutyNotifier(config.pagerDutyKey));
  if (config.webhookUrl) notifiers.push(new WebhookNotifier(config.webhookUrl));
  const alertLog = new AlertLog(`${config.statePath}.alerts.jsonl`);
  const engine = new MonitorEngine(config.monitors, notifiers, alertLog);

  const buildContext = async (): Promise<MonitorContext> => {
    const list = await controller.list();
    const qs = await Promise.all(
      list.map(async (q) => ({
        name: q.name,
        counts: q.counts,
        workers: (await controller.workers(q.name))?.length ?? 0,
      })),
    );
    let reachable = true;
    let usedMemoryBytes: number | undefined;
    try {
      const info = await connection.info('memory');
      const m = /used_memory:(\d+)/.exec(info);
      if (m?.[1]) usedMemoryBytes = Number(m[1]);
    } catch {
      reachable = false;
    }
    const redis: MonitorContext['redis'] = { reachable };
    if (usedMemoryBytes !== undefined) redis.usedMemoryBytes = usedMemoryBytes;
    return { queues: qs, redis };
  };

  let monitorTimer: ReturnType<typeof setInterval> | undefined;
  if (Object.keys(config.monitors).length > 0) {
    monitorTimer = setInterval(() => {
      void (async () => {
        try {
          await engine.runOnce(await buildContext());
        } catch {
          /* monitors are fail-open */
        }
      })();
    }, config.monitorIntervalMs);
    monitorTimer.unref();
  }

  const staticDir = fileURLToPath(new URL('./public', import.meta.url));
  const app = buildControlApp(config, {
    controller,
    actions,
    inspector,
    monitors: { current: () => engine.current(), config: config.monitors },
    alerts: alertLog,
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
    if (monitorTimer) clearInterval(monitorTimer);
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
