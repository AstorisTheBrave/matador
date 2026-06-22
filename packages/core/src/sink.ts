export interface JobLabels {
  queue: string;
  name?: string;
}

/** Backend-agnostic metrics surface. Exporters implement this (invariant I2). */
export interface MetricsSink {
  observeProcessingSeconds(labels: JobLabels, seconds: number): void;
  observeWaitSeconds(labels: JobLabels, seconds: number): void;
  incCompleted(labels: JobLabels): void;
  incFailed(labels: JobLabels): void;
  incRetried(labels: JobLabels): void;
  /** Self-health: instrumentation errors swallowed by fail-open (invariant I3). */
  incInstrumentationError(): void;
}

export const NoopSink: MetricsSink = {
  observeProcessingSeconds() {},
  observeWaitSeconds() {},
  incCompleted() {},
  incFailed() {},
  incRetried() {},
  incInstrumentationError() {},
};
