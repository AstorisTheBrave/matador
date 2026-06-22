import { Counter, Histogram, type Registry } from 'prom-client';

const LABEL_NAMES = ['queue', 'name'] as const;

export function buildMetrics(registry: Registry, buckets: number[]) {
  return {
    processing: new Histogram({
      name: 'matador_job_processing_seconds',
      help: 'Job processing duration (finishedOn - processedOn), per attempt.',
      labelNames: LABEL_NAMES,
      buckets,
      registers: [registry],
    }),
    wait: new Histogram({
      name: 'matador_job_wait_seconds',
      help: 'Retry-aware time a job waited before an attempt started.',
      labelNames: LABEL_NAMES,
      buckets,
      registers: [registry],
    }),
    completed: new Counter({
      name: 'matador_jobs_completed_total',
      help: 'Completed jobs.',
      labelNames: LABEL_NAMES,
      registers: [registry],
    }),
    failed: new Counter({
      name: 'matador_jobs_failed_total',
      help: 'Failed jobs.',
      labelNames: LABEL_NAMES,
      registers: [registry],
    }),
    retried: new Counter({
      name: 'matador_jobs_retried_total',
      help: 'Retried job attempts.',
      labelNames: LABEL_NAMES,
      registers: [registry],
    }),
    instrumentationErrors: new Counter({
      name: 'matador_instrumentation_errors_total',
      help: 'Errors swallowed by fail-open (self-health).',
      registers: [registry],
    }),
  };
}

export type Metrics = ReturnType<typeof buildMetrics>;
