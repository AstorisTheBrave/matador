import { QueueDepthCollector, type JobCounts } from '@matadormq/core';
import { sanitizeFailedJob, type FailedJobView } from './views.js';
import { groupFailures, type DlqAnalytics } from './analytics.js';
import { StuckDetector } from './stuck.js';

export interface QueueLike {
  name: string;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  getFailed(start: number, end: number): Promise<unknown[]>;
  getWorkers?(): Promise<unknown[]>;
  getMetrics?(
    type: string,
    start?: number,
    end?: number,
  ): Promise<{ data?: number[]; count?: number; meta?: unknown }>;
}

export interface WorkerInfo {
  name: string;
  addr: string | undefined;
  age: number | undefined;
  idle: number | undefined;
}

export interface QueueMetrics {
  type: 'completed' | 'failed';
  /** Per-minute counts, most recent last. */
  data: number[];
  /** Total since metrics collection started. */
  count: number;
}

function sanitizeWorker(w: unknown): WorkerInfo {
  const o = (w ?? {}) as Record<string, unknown>;
  return {
    name: String(o.name ?? ''),
    addr: typeof o.addr === 'string' ? o.addr : undefined,
    age: typeof o.age === 'number' ? o.age : undefined,
    idle: typeof o.idle === 'number' ? o.idle : undefined,
  };
}

export interface QueueSummary {
  name: string;
  counts: JobCounts;
  stuck: boolean;
}

export interface QueueDetail {
  name: string;
  counts: JobCounts;
  stuck: boolean;
  dlqSample: FailedJobView[];
}

export interface QueueControllerOptions {
  scrapeCacheTtlMs?: number;
  scrapeTimeoutMs?: number;
  /** Max failed jobs returned in a DLQ sample. */
  dlqSampleLimit?: number;
  /** Max failed jobs scanned for DLQ analytics. */
  dlqAnalyticsSample?: number;
  /** Snapshots before a no-progress queue is flagged stuck. */
  stuckWindow?: number;
  onError?: () => void;
}

const ZERO_COUNTS: JobCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
  paused: 0,
  prioritized: 0,
  'waiting-children': 0,
};

/**
 * Read-side controller over a fixed set of BullMQ queues. Counts come from the
 * shared single-flight collector (one Redis round-trip per scrape across all
 * viewers, invariant I6); DLQ samples are bounded and payload-stripped (I5).
 */
export class QueueController {
  private readonly collector: QueueDepthCollector;
  private readonly dlqSampleLimit: number;
  private readonly dlqAnalyticsSample: number;
  private readonly stuck: StuckDetector;

  constructor(
    private readonly queues: Map<string, QueueLike>,
    opts: QueueControllerOptions = {},
  ) {
    this.collector = new QueueDepthCollector(
      opts.scrapeCacheTtlMs ?? 5_000,
      opts.onError ?? (() => {}),
      undefined,
      opts.scrapeTimeoutMs ?? 5_000,
    );
    for (const q of queues.values()) this.collector.register(q);
    this.dlqSampleLimit = opts.dlqSampleLimit ?? 20;
    this.dlqAnalyticsSample = opts.dlqAnalyticsSample ?? 200;
    this.stuck = new StuckDetector(opts.stuckWindow ?? 5);
  }

  names(): string[] {
    return [...this.queues.keys()].sort();
  }

  has(name: string): boolean {
    return this.queues.has(name);
  }

  async list(): Promise<QueueSummary[]> {
    const snapshot = await this.collector.snapshot();
    return this.names().map((name) => {
      const counts = snapshot.get(name) ?? ZERO_COUNTS;
      this.stuck.record(name, counts);
      return { name, counts, stuck: this.stuck.isStuck(name) };
    });
  }

  async detail(name: string): Promise<QueueDetail | undefined> {
    const queue = this.queues.get(name);
    if (!queue) return undefined;
    const snapshot = await this.collector.snapshot();
    const counts = snapshot.get(name) ?? ZERO_COUNTS;
    this.stuck.record(name, counts);
    const failed = await queue.getFailed(0, this.dlqSampleLimit - 1);
    const dlqSample = failed.slice(0, this.dlqSampleLimit).map((j) => sanitizeFailedJob(j as never));
    return { name, counts, stuck: this.stuck.isStuck(name), dlqSample };
  }

  /** List the workers attached to a queue (bounded). */
  async workers(name: string): Promise<WorkerInfo[] | undefined> {
    const queue = this.queues.get(name);
    if (!queue) return undefined;
    if (!queue.getWorkers) return [];
    const ws = await queue.getWorkers();
    return ws.slice(0, 200).map(sanitizeWorker);
  }

  /** Per-minute completed/failed counts from BullMQ's stored metrics. */
  async metrics(name: string, type: 'completed' | 'failed'): Promise<QueueMetrics | undefined> {
    const queue = this.queues.get(name);
    if (!queue) return undefined;
    if (!queue.getMetrics) return { type, data: [], count: 0 };
    const m = await queue.getMetrics(type);
    return {
      type,
      data: Array.isArray(m.data) ? m.data.slice(-1440) : [],
      count: typeof m.count === 'number' ? m.count : 0,
    };
  }

  /** Group the dead-letter queue by normalized failure reason (bounded sample). */
  async dlqAnalytics(name: string): Promise<DlqAnalytics | undefined> {
    const queue = this.queues.get(name);
    if (!queue) return undefined;
    const failed = await queue.getFailed(0, this.dlqAnalyticsSample - 1);
    return groupFailures(failed as { id?: string; failedReason?: string }[]);
  }
}
