import { describe, it, expect } from 'vitest';
import { InMemoryMetricExporter, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { OtlpSink } from '../src/index.js';

describe('OtlpSink fail-open (I3)', () => {
  it('never throws into the caller when an instrument throws', () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const sink = new OtlpSink({ exporter });

    // Replace one instrument with a throwing stub.
    const broken = { add() {
      throw new Error('boom');
    } };
    (sink as unknown as { m: Record<string, unknown> }).m.completed = broken;

    expect(() => sink.incCompleted({ queue: 'q' })).not.toThrow();
  });

  it('does not throw if the self-health counter itself throws', () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const sink = new OtlpSink({ exporter });
    const m = (sink as unknown as { m: Record<string, unknown> }).m;
    m.completed = {
      add() {
        throw new Error('boom');
      },
    };
    m.errors = {
      add() {
        throw new Error('errors broken too');
      },
    };
    expect(() => sink.incCompleted({ queue: 'q' })).not.toThrow();
  });
});
