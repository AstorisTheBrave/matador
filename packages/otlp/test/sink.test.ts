import { describe, it, expect } from 'vitest';
import { InMemoryMetricExporter, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { OtlpSink } from '../src/index.js';

function metricNames(exporter: InMemoryMetricExporter): string[] {
  return exporter
    .getMetrics()
    .flatMap((rm) => rm.scopeMetrics)
    .flatMap((sm) => sm.metrics)
    .map((m) => m.descriptor.name);
}

describe('OtlpSink', () => {
  it('records histograms and counters and exports them on forceFlush', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const sink = new OtlpSink({ exporter });

    sink.observeProcessingSeconds({ queue: 'emails' }, 0.5);
    sink.observeWaitSeconds({ queue: 'emails' }, 0.2);
    sink.incCompleted({ queue: 'emails' });
    sink.incFailed({ queue: 'emails' });
    sink.incRetried({ queue: 'emails' });

    await sink.forceFlush();

    const names = metricNames(exporter);
    expect(names).toContain('matador.job.processing');
    expect(names).toContain('matador.job.wait');
    expect(names).toContain('matador.jobs.completed');
    expect(names).toContain('matador.jobs.failed');
    expect(names).toContain('matador.jobs.retried');

    await sink.shutdown();
  });

  it('only carries queue/name attributes (I5)', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const sink = new OtlpSink({ exporter, labelJobName: true });
    sink.incCompleted({ queue: 'emails', name: 'send' });
    await sink.forceFlush();

    const attrs = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .flatMap((m) => m.dataPoints)
      .flatMap((dp) => Object.keys(dp.attributes));
    expect(new Set(attrs)).toEqual(new Set(['queue', 'name']));

    await sink.shutdown();
  });
});
