import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
} from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { safe, type JobLabels, type MetricsSink } from '@matador/core';
import { buildInstruments, type Instruments } from './instruments.js';
import { resolveEndpoint } from './config.js';

export { validateEndpoint, resolveEndpoint } from './config.js';

export interface OtlpSinkOptions {
  /** OTLP/HTTP endpoint. Falls back to MATADOR_OTLP_ENDPOINT. */
  endpoint?: string;
  intervalMs?: number;
  exportTimeoutMs?: number;
  resourceAttributes?: Record<string, string>;
  labelJobName?: boolean;
  buckets?: number[];
  /** Inject a custom exporter (for tests). When set, `endpoint` is not read. */
  exporter?: PushMetricExporter;
}

/**
 * A `MetricsSink` that exports Matador's metrics over OTLP. Every record is
 * fail-open (invariant I3): a throwing instrument bumps the self-health counter
 * and never propagates into the worker. Attributes are `queue` and opt-in `name`
 * only (invariant I5).
 */
export class OtlpSink implements MetricsSink {
  private readonly provider: MeterProvider;
  private readonly m: Instruments;
  private readonly labelJobName: boolean;

  constructor(opts: OtlpSinkOptions = {}) {
    const exporter = opts.exporter ?? new OTLPMetricExporter({ url: resolveEndpoint(opts.endpoint) });
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: opts.intervalMs ?? 10_000,
      exportTimeoutMillis: opts.exportTimeoutMs ?? 10_000,
    });
    this.provider = new MeterProvider({
      readers: [reader],
      resource: resourceFromAttributes({
        'service.name': 'matador',
        ...(opts.resourceAttributes ?? {}),
      }),
    });
    this.m = buildInstruments(this.provider.getMeter('matador'), opts.buckets);
    this.labelJobName = opts.labelJobName ?? false;
  }

  private attrs(l: JobLabels): Record<string, string> {
    return this.labelJobName && l.name !== undefined ? { queue: l.queue, name: l.name } : { queue: l.queue };
  }

  private bumpError = (): void => {
    try {
      this.m.errors.add(1);
    } catch {
      /* never let self-health reporting throw */
    }
  };

  observeProcessingSeconds(l: JobLabels, s: number): void {
    safe(() => this.m.processing.record(s, this.attrs(l)), this.bumpError);
  }
  observeWaitSeconds(l: JobLabels, s: number): void {
    safe(() => this.m.wait.record(s, this.attrs(l)), this.bumpError);
  }
  incCompleted(l: JobLabels): void {
    safe(() => this.m.completed.add(1, this.attrs(l)), this.bumpError);
  }
  incFailed(l: JobLabels): void {
    safe(() => this.m.failed.add(1, this.attrs(l)), this.bumpError);
  }
  incRetried(l: JobLabels): void {
    safe(() => this.m.retried.add(1, this.attrs(l)), this.bumpError);
  }
  incInstrumentationError(): void {
    this.bumpError();
  }

  /** Flush pending metric points immediately. */
  async forceFlush(): Promise<void> {
    await this.provider.forceFlush();
  }

  /** Flush and stop the periodic reader. */
  async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }
}
