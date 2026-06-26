interface Sample {
  active: number;
  completed: number;
  failed: number;
  paused: number;
}

/**
 * Flags a queue as stuck when it has had active work across the whole window but
 * made no progress (completed + failed did not advance). Paused queues are never
 * stuck. State is a bounded per-queue ring buffer.
 */
export class StuckDetector {
  private readonly history = new Map<string, Sample[]>();

  constructor(private readonly windowSize = 5) {}

  record(queue: string, sample: Sample): void {
    const ring = this.history.get(queue) ?? [];
    ring.push(sample);
    while (ring.length > this.windowSize) ring.shift();
    this.history.set(queue, ring);
  }

  isStuck(queue: string): boolean {
    const ring = this.history.get(queue);
    if (!ring || ring.length < this.windowSize) return false;
    const last = ring[ring.length - 1];
    const first = ring[0];
    if (!last || !first || last.paused > 0) return false;
    const throughput = last.completed + last.failed - (first.completed + first.failed);
    const persistentlyActive = ring.every((s) => s.active > 0);
    return persistentlyActive && throughput === 0;
  }
}
