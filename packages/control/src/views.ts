export interface FailedJobView {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | undefined;
  finishedOn: number | undefined;
}

interface RawFailedJob {
  id?: string;
  name?: string;
  failedReason?: string;
  attemptsMade?: number;
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
  data?: unknown;
  stacktrace?: unknown;
}

/**
 * Reduce a failed job to safe metadata only. The job payload (`data`) and
 * stacktrace are never exposed (no PII, bounded size); the failure reason is
 * truncated.
 */
export function sanitizeFailedJob(job: RawFailedJob, maxReason = 500): FailedJobView {
  return {
    id: String(job.id ?? ''),
    name: String(job.name ?? ''),
    failedReason: String(job.failedReason ?? '').slice(0, maxReason),
    attemptsMade: typeof job.attemptsMade === 'number' ? job.attemptsMade : 0,
    timestamp: typeof job.timestamp === 'number' ? job.timestamp : 0,
    processedOn: typeof job.processedOn === 'number' ? job.processedOn : undefined,
    finishedOn: typeof job.finishedOn === 'number' ? job.finishedOn : undefined,
  };
}

/** Clamp a requested page size into [1, max], defaulting when absent/invalid. */
export function clampPageSize(requested: number | undefined, def: number, max: number): number {
  if (requested === undefined || !Number.isFinite(requested) || requested < 1) return def;
  return Math.min(Math.floor(requested), max);
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total: items.length,
  };
}
