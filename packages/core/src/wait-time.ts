export interface JobTimes {
  timestamp: number; // job creation (ms epoch)
  processedOn: number; // when this attempt started (ms epoch)
  attemptsMade: number; // 1 on first run
}

/**
 * Bounded LRU of jobId -> last finishedOn, used to compute retry-aware wait-time.
 *
 * The naive metric `processedOn - timestamp` inflates wait-time across retries,
 * because `timestamp` is creation time: a job that failed and was re-queued would
 * report its entire prior runtime as "wait". We instead measure the wait before
 * each attempt as `processedOn - max(timestamp, lastFinishedOn)`.
 */
export class WaitTimeTracker {
  private readonly map = new Map<string, number>();

  constructor(private readonly capacity: number) {}

  recordFinish(jobId: string, finishedOn: number): void {
    if (this.map.has(jobId)) this.map.delete(jobId);
    this.map.set(jobId, finishedOn);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  has(jobId: string): boolean {
    return this.map.has(jobId);
  }

  /** Seconds the job actually waited before THIS attempt started. */
  waitSeconds(jobId: string, t: JobTimes): number {
    const prior = t.attemptsMade > 1 ? this.map.get(jobId) : undefined;
    const since = prior !== undefined ? Math.max(t.timestamp, prior) : t.timestamp;
    return Math.max(0, (t.processedOn - since) / 1000);
  }
}
