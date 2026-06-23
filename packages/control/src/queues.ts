import { QueueDepthCollector, type JobCounts } from '@matadormq/core';
import { sanitizeFailedJob, type FailedJobView } from './views.js';

export interface QueueLike {
  name: string;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  getFailed(start: number, end: number): Promise<unknown[]>;
}

export interface QueueDetail {
  name: string;
  counts: JobCounts;
  dlqSample: FailedJobView[];
}

export interface QueueControllerOptions {
  scrapeCacheTtlMs?: number;
  scrapeTimeoutMs?: number;
  /** Max failed jobs returned in a DLQ sample. */
  dlqSampleLimit?: number;
  onError?: () => void;
}

/**
 * Read-side controller over a fixed set of BullMQ queues. Counts come from the
 * shared single-flight collector (one Redis round-trip per scrape across all
 * viewers, invariant I6); DLQ samples are bounded and payload-stripped (I5).
 */
export class QueueController {
  private readonly collector: QueueDepthCollector;
  private readonly dlqSampleLimit: number;

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
  }

  names(): string[] {
    return [...this.queues.keys()].sort();
  }

  has(name: string): boolean {
    return this.queues.has(name);
  }

  async list(): Promise<{ name: string; counts: JobCounts }[]> {
    const snapshot = await this.collector.snapshot();
    return this.names().map((name) => ({
      name,
      counts: snapshot.get(name) ?? {
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 0,
        paused: 0,
        prioritized: 0,
        'waiting-children': 0,
      },
    }));
  }

  async detail(name: string): Promise<QueueDetail | undefined> {
    const queue = this.queues.get(name);
    if (!queue) return undefined;
    const snapshot = await this.collector.snapshot();
    const counts = snapshot.get(name) ?? {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
      paused: 0,
      prioritized: 0,
      'waiting-children': 0,
    };
    const failed = await queue.getFailed(0, this.dlqSampleLimit - 1);
    const dlqSample = failed.slice(0, this.dlqSampleLimit).map((j) => sanitizeFailedJob(j as never));
    return { name, counts, dlqSample };
  }
}
