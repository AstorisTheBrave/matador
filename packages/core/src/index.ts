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
export { resolveConfig } from './config.js';
export { safe } from './failopen.js';

interface MinimalWorkerLike {
  on(event: string, cb: (...args: never[]) => void): unknown;
}

/**
 * One-line integration (invariant I1): instrument a BullMQ Worker.
 *
 * ```ts
 * instrument(worker, { sink: new PrometheusSink() });
 * ```
 */
export function instrument(
  worker: MinimalWorkerLike,
  opts: PartialConfig & { sink: MetricsSink },
): MatadorRegistry {
  const { sink, ...cfg } = opts;
  const reg = new MatadorRegistry(sink, resolveConfig(cfg));
  instrumentWorker(worker as never, reg);
  return reg;
}
