import type { MetricsSink } from './sink.js';
import type { MatadorConfig } from './types.js';
import { WaitTimeTracker } from './wait-time.js';

export class MatadorRegistry {
  readonly waitTracker: WaitTimeTracker;

  constructor(
    readonly sink: MetricsSink,
    readonly config: MatadorConfig,
  ) {
    this.waitTracker = new WaitTimeTracker(config.waitTimeLruSize);
  }
}
