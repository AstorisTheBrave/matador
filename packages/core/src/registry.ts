import type { MetricsSink } from './sink.js';
import type { MatadorConfig } from './types.js';
import { WaitTimeTracker } from './wait-time.js';
import { QueueDepthCollector } from './scrape.js';

export class MatadorRegistry {
  readonly waitTracker: WaitTimeTracker;
  private _depthCollector: QueueDepthCollector | undefined = undefined;

  constructor(
    readonly sink: MetricsSink,
    readonly config: MatadorConfig,
  ) {
    this.waitTracker = new WaitTimeTracker(config.waitTimeLruSize);
  }

  /** Lazily created scrape-time queue-depth collector (invariant I6). */
  get depthCollector(): QueueDepthCollector {
    if (!this._depthCollector) {
      this._depthCollector = new QueueDepthCollector(
        this.config.scrapeCacheTtlMs,
        () => this.sink.incInstrumentationError(),
        undefined,
        this.config.scrapeTimeoutMs,
      );
    }
    return this._depthCollector;
  }
}
