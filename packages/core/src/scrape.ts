export interface JobCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
  prioritized: number;
  'waiting-children': number;
}

export const JOB_STATES: readonly (keyof JobCounts)[] = [
  'waiting',
  'active',
  'delayed',
  'failed',
  'completed',
  'paused',
  'prioritized',
  'waiting-children',
];

function zeroCounts(): JobCounts {
  return {
    waiting: 0,
    active: 0,
    delayed: 0,
    failed: 0,
    completed: 0,
    paused: 0,
    prioritized: 0,
    'waiting-children': 0,
  };
}

interface MinimalQueue {
  name: string;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
}

interface CacheEntry {
  value: Map<string, JobCounts>;
  expiresAt: number;
}

/** Reject after `ms` if the underlying promise has not settled. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('getJobCounts timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Reads queue-depth counts from registered queues at scrape time, behind a
 * short-TTL single-flight cache: N concurrent scrapers cost one Redis round-trip
 * per queue (invariant I6). A queue whose read fails yields zeros and reports the
 * error rather than failing the whole snapshot (fail-open, invariant I3).
 */
export class QueueDepthCollector {
  private readonly queues = new Map<string, MinimalQueue>();
  private cache?: CacheEntry;
  private inflight: Promise<Map<string, JobCounts>> | undefined = undefined;

  constructor(
    private readonly ttlMs: number,
    private readonly onError: () => void,
    private readonly now: () => number = () => Date.now(),
    private readonly timeoutMs: number = 5_000,
  ) {}

  register(queue: MinimalQueue): void {
    this.queues.set(queue.name, queue);
  }

  snapshot(): Promise<Map<string, JobCounts>> {
    const cached = this.cache;
    if (cached && this.now() < cached.expiresAt) return Promise.resolve(cached.value);
    if (this.inflight) return this.inflight;

    this.inflight = this.fetch().then((value) => {
      this.cache = { value, expiresAt: this.now() + this.ttlMs };
      this.inflight = undefined;
      return value;
    });
    return this.inflight;
  }

  private async fetch(): Promise<Map<string, JobCounts>> {
    const entries = await Promise.all(
      [...this.queues.values()].map(async (queue): Promise<[string, JobCounts]> => {
        try {
          const raw = await withTimeout(queue.getJobCounts(...JOB_STATES), this.timeoutMs);
          const counts = zeroCounts();
          for (const state of JOB_STATES) {
            const n = raw[state];
            if (typeof n === 'number') counts[state] = n;
          }
          return [queue.name, counts];
        } catch {
          this.onError();
          return [queue.name, zeroCounts()];
        }
      }),
    );
    return new Map(entries);
  }
}
