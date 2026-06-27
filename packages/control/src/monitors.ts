import { appendFile, readFile } from 'node:fs/promises';
import type { JobCounts } from '@matadormq/core';
import { notifyAll, type Alert, type Notifier } from './notifier.js';

export interface MonitorConfig {
  /** Alert when a queue's failed count exceeds this. */
  failedThreshold?: number;
  /** Alert when a queue's waiting count exceeds this. */
  backlogThreshold?: number;
  /** Alert when Redis used_memory exceeds this many bytes. */
  maxMemoryBytes?: number;
  /** Alert when a queue has pending jobs but no workers. */
  missingWorkers?: boolean;
  /** Alert when Redis is unreachable. */
  connection?: boolean;
}

export interface MonitorContext {
  queues: { name: string; counts: JobCounts; workers: number }[];
  redis: { reachable: boolean; usedMemoryBytes?: number };
}

function alert(
  monitor: string,
  severity: Alert['severity'],
  queue: string | undefined,
  message: string,
  ts: string,
): Alert {
  return { ts, monitor, severity, queue, message, resolved: false };
}

/** Pure evaluation: which monitors are currently breached, keyed for de-dup. */
export function evaluateBreaches(
  config: MonitorConfig,
  context: MonitorContext,
  ts: string,
): Map<string, Alert> {
  const out = new Map<string, Alert>();

  if (config.connection && !context.redis.reachable) {
    out.set('connection', alert('connection', 'critical', undefined, 'Redis is unreachable', ts));
  }
  if (config.maxMemoryBytes !== undefined && (context.redis.usedMemoryBytes ?? 0) > config.maxMemoryBytes) {
    out.set(
      'memory',
      alert('max-memory', 'warning', undefined, `Redis memory exceeds ${config.maxMemoryBytes} bytes`, ts),
    );
  }
  for (const q of context.queues) {
    if (config.failedThreshold !== undefined && q.counts.failed > config.failedThreshold) {
      out.set(`failed:${q.name}`, alert('failed-jobs', 'warning', q.name, `${q.name}: ${q.counts.failed} failed jobs`, ts));
    }
    if (config.backlogThreshold !== undefined && q.counts.waiting > config.backlogThreshold) {
      out.set(`backlog:${q.name}`, alert('backlog', 'warning', q.name, `${q.name}: ${q.counts.waiting} waiting`, ts));
    }
    if (config.missingWorkers && q.workers === 0 && q.counts.waiting + q.counts.active > 0) {
      out.set(
        `workers:${q.name}`,
        alert('missing-workers', 'critical', q.name, `${q.name} has pending jobs but no workers`, ts),
      );
    }
  }
  return out;
}

/** Append-only alert history (JSONL). */
export class AlertLog {
  constructor(private readonly path: string) {}

  async record(a: Alert): Promise<void> {
    await appendFile(this.path, `${JSON.stringify(a)}\n`, 'utf8');
  }

  async readAll(limit = 200): Promise<Alert[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    return lines.slice(-limit).map((l) => JSON.parse(l) as Alert);
  }
}

/**
 * Evaluates monitors on each tick, firing on a new breach and resolving when it
 * clears (de-duplicated against the currently-firing set), recording every alert
 * to history and pushing it to all notifiers.
 */
export class MonitorEngine {
  private readonly firing = new Map<string, Alert>();

  constructor(
    private readonly config: MonitorConfig,
    private readonly notifiers: readonly Notifier[],
    private readonly history: AlertLog,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async runOnce(context: MonitorContext): Promise<Alert[]> {
    const ts = new Date(this.now()).toISOString();
    const breaches = evaluateBreaches(this.config, context, ts);
    const fired: Alert[] = [];

    for (const [key, a] of breaches) {
      if (!this.firing.has(key)) {
        this.firing.set(key, a);
        fired.push(a);
        await this.emit(a);
      }
    }
    for (const [key, prev] of [...this.firing]) {
      if (!breaches.has(key)) {
        this.firing.delete(key);
        const resolved: Alert = { ...prev, resolved: true, ts, message: `${prev.message} (recovered)` };
        fired.push(resolved);
        await this.emit(resolved);
      }
    }
    return fired;
  }

  current(): Alert[] {
    return [...this.firing.values()];
  }

  private async emit(a: Alert): Promise<void> {
    await this.history.record(a);
    await notifyAll(this.notifiers, a);
  }
}
