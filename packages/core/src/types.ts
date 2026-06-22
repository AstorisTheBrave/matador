export interface MatadorConfig {
  /** Include the job `name` as a metric label. Default false (bounded cardinality, I5). */
  labelJobName: boolean;
  /** Histogram buckets in seconds for durations. */
  durationBucketsSeconds: number[];
  /** Max entries in the wait-time LRU used for retry-aware computation. */
  waitTimeLruSize: number;
}

export type PartialConfig = Partial<MatadorConfig>;
