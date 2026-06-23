import { Gauge, Registry } from 'prom-client';
import { JOB_STATES, type JobLabels, type MetricsSink, type QueueDepthCollector } from '@matadormq/core';
import { buildMetrics, type Metrics } from './metrics.js';

const DEFAULT_BUCKETS = [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 300];

export interface PrometheusSinkOptions {
  registry?: Registry;
  buckets?: number[];
}

export class PrometheusSink implements MetricsSink {
  readonly registry: Registry;
  private readonly m: Metrics;

  constructor(opts: PrometheusSinkOptions = {}) {
    this.registry = opts.registry ?? new Registry();
    this.m = buildMetrics(this.registry, opts.buckets ?? DEFAULT_BUCKETS);
  }

  private lv(l: JobLabels): Record<string, string> {
    return l.name !== undefined ? { queue: l.queue, name: l.name } : { queue: l.queue };
  }

  observeProcessingSeconds(l: JobLabels, s: number): void {
    this.m.processing.observe(this.lv(l), s);
  }
  observeWaitSeconds(l: JobLabels, s: number): void {
    this.m.wait.observe(this.lv(l), s);
  }
  incCompleted(l: JobLabels): void {
    this.m.completed.inc(this.lv(l));
  }
  incFailed(l: JobLabels): void {
    this.m.failed.inc(this.lv(l));
  }
  incRetried(l: JobLabels): void {
    this.m.retried.inc(this.lv(l));
  }
  incInstrumentationError(): void {
    this.m.instrumentationErrors.inc();
  }

  /**
   * Register a scrape-time `matador_queue_depth` gauge that reads the collector
   * once per scrape (single-flight, invariant I6). Labels are `queue` and `state`
   * only (invariant I5).
   */
  attachQueueDepth(collector: QueueDepthCollector): void {
    new Gauge({
      name: 'matador_queue_depth',
      help: 'Jobs per queue per state, read at scrape time behind a single-flight cache.',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
      async collect() {
        const snapshot = await collector.snapshot();
        this.reset();
        for (const [queue, counts] of snapshot) {
          for (const state of JOB_STATES) {
            this.set({ queue, state }, counts[state]);
          }
        }
      },
    });
  }
}

export { metricsPlugin } from './endpoint.js';
