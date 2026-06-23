import type { JobLabels, MetricsSink } from './sink.js';
import { safe } from './failopen.js';

/**
 * Fans every measurement out to several sinks (for example Prometheus and OTLP at
 * once). Each fan-out is independently fail-open (invariant I3): one sink throwing
 * never stops the others and never propagates to the caller.
 */
export class MultiSink implements MetricsSink {
  constructor(private readonly sinks: readonly MetricsSink[]) {}

  private fan(call: (sink: MetricsSink) => void): void {
    for (const sink of this.sinks) {
      safe(() => call(sink), () => {});
    }
  }

  observeProcessingSeconds(l: JobLabels, s: number): void {
    this.fan((sink) => sink.observeProcessingSeconds(l, s));
  }
  observeWaitSeconds(l: JobLabels, s: number): void {
    this.fan((sink) => sink.observeWaitSeconds(l, s));
  }
  incCompleted(l: JobLabels): void {
    this.fan((sink) => sink.incCompleted(l));
  }
  incFailed(l: JobLabels): void {
    this.fan((sink) => sink.incFailed(l));
  }
  incRetried(l: JobLabels): void {
    this.fan((sink) => sink.incRetried(l));
  }
  incInstrumentationError(): void {
    this.fan((sink) => sink.incInstrumentationError());
  }
}
