import type { Counter, Histogram, Meter } from '@opentelemetry/api';

const DURATION_BUCKETS = [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 300];

export interface Instruments {
  processing: Histogram;
  wait: Histogram;
  completed: Counter;
  failed: Counter;
  retried: Counter;
  errors: Counter;
}

export function buildInstruments(meter: Meter, buckets: number[] = DURATION_BUCKETS): Instruments {
  return {
    processing: meter.createHistogram('matador.job.processing', {
      unit: 's',
      description: 'Job processing duration (finishedOn - processedOn), per attempt.',
      advice: { explicitBucketBoundaries: buckets },
    }),
    wait: meter.createHistogram('matador.job.wait', {
      unit: 's',
      description: 'Retry-aware time a job waited before an attempt started.',
      advice: { explicitBucketBoundaries: buckets },
    }),
    completed: meter.createCounter('matador.jobs.completed', { description: 'Completed jobs.' }),
    failed: meter.createCounter('matador.jobs.failed', { description: 'Failed jobs.' }),
    retried: meter.createCounter('matador.jobs.retried', { description: 'Retried job attempts.' }),
    errors: meter.createCounter('matador.instrumentation.errors', {
      description: 'Errors swallowed by fail-open (self-health).',
    }),
  };
}
