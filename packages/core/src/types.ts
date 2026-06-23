export interface MatadorConfig {
  /** Include the job `name` as a metric label. Default false (bounded cardinality, I5). */
  labelJobName: boolean;
  /** Histogram buckets in seconds for durations. */
  durationBucketsSeconds: number[];
  /** Max entries in the wait-time LRU used for retry-aware computation. */
  waitTimeLruSize: number;
  /** TTL in ms for the scrape-time queue-depth single-flight cache (invariant I6). */
  scrapeCacheTtlMs: number;
  /** Per-queue timeout in ms for a scrape-time getJobCounts read (fail-open on a hung Redis). */
  scrapeTimeoutMs: number;
}

export type PartialConfig = Partial<MatadorConfig>;
