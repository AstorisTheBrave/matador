import type { MetricsSink } from './sink.js';
import type { PartialConfig } from './types.js';
import { resolveConfig } from './config.js';
import { MatadorRegistry } from './registry.js';
import { instrumentWorker } from './instrument-worker.js';

export type { MetricsSink, JobLabels } from './sink.js';
export type { MatadorConfig, PartialConfig } from './types.js';
export { NoopSink } from './sink.js';
export { MatadorRegistry } from './registry.js';
export { WaitTimeTracker } from './wait-time.js';
export { QueueDepthCollector, JOB_STATES } from './scrape.js';
export type { JobCounts } from './scrape.js';
export { resolveConfig } from './config.js';
export { safe } from './failopen.js';

interface MinimalWorkerLike {
  on(event: string, cb: (...args: never[]) => void): unknown;
}

interface MinimalQueueLike {
  name: string;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
}

function isQueue(target: object): target is MinimalQueueLike {
  return typeof (target as Partial<MinimalQueueLike>).getJobCounts === 'function';
}

/**
 * One-line integration (invariant I1). Pass a BullMQ Worker to record retry-aware
 * latency/wait histograms and throughput, or a Queue to expose scrape-time
 * queue-depth gauges (read behind the single-flight cache, invariant I6).
 *
 * ```ts
 * instrument(worker, { sink: new PrometheusSink() });
 * instrument(queue, { sink });
 * ```
 */
export function instrument(
  target: MinimalWorkerLike | MinimalQueueLike,
  opts: PartialConfig & { sink: MetricsSink },
): MatadorRegistry {
  const { sink, ...cfg } = opts;
  const reg = new MatadorRegistry(sink, resolveConfig(cfg));
  if (isQueue(target)) {
    reg.depthCollector.register(target);
  } else {
    instrumentWorker(target as never, reg);
  }
  return reg;
}
