import type { AuditLog } from './audit.js';
import { UnknownQueueError } from './errors.js';

export interface JobLike {
  id?: string;
  name: string;
  data: unknown;
  opts: unknown;
  progress: unknown;
  returnvalue: unknown;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  parent?: { id: string; queueKey?: string };
  getState(): Promise<string>;
  retry(state?: string): Promise<void>;
  remove(): Promise<void>;
  promote(): Promise<void>;
  discard?(): Promise<void>;
  updateData?(data: unknown): Promise<void>;
  getDependenciesCount?(): Promise<{ processed?: number; unprocessed?: number }>;
}

export interface InspectorQueueLike {
  name: string;
  getJobs(types: string[], start: number, end: number, asc?: boolean): Promise<JobLike[]>;
  getJob(id: string): Promise<JobLike | null | undefined>;
  getJobLogs(id: string, start?: number, end?: number): Promise<{ logs: string[]; count: number }>;
  add?(name: string, data: unknown, opts?: unknown): Promise<{ id?: string }>;
  getDelayed?(start: number, end: number): Promise<JobLike[]>;
}

export interface JobSummary {
  id: string;
  name: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | undefined;
  finishedOn: number | undefined;
  failedReason: string | undefined;
}

export interface JobDetail extends JobSummary {
  state: string;
  data: unknown;
  opts: unknown;
  progress: unknown;
  returnvalue: unknown;
  stacktrace: string[];
}

export interface JobTree {
  id: string;
  name: string;
  parent: { id: string } | undefined;
  children: { processed: number; unprocessed: number };
}

export const JOB_LIST_STATES = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'completed',
  'failed',
] as const;

/** Cap any value's JSON form so a huge payload cannot be dumped wholesale. */
function bounded(value: unknown, maxBytes = 16_384): unknown {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return '<unserializable>';
  }
  if (json === undefined) return value;
  if (json.length <= maxBytes) return value;
  return { truncated: true, preview: json.slice(0, maxBytes) };
}

function summary(job: JobLike): JobSummary {
  return {
    id: String(job.id ?? ''),
    name: job.name,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? undefined,
    finishedOn: job.finishedOn ?? undefined,
    failedReason: job.failedReason ? job.failedReason.slice(0, 500) : undefined,
  };
}

export interface JobInspectorOptions {
  /** Max jobs returned per page. */
  maxPageSize?: number;
  /** Max log lines returned per page. */
  maxLogLines?: number;
}

/**
 * Read-side inspector and write-side per-job actions over BullMQ jobs. Reads are
 * bounded (pagination, payload caps); actions are audited.
 */
export class JobInspector {
  private readonly maxPageSize: number;
  private readonly maxLogLines: number;

  constructor(
    private readonly queues: Map<string, InspectorQueueLike>,
    private readonly audit: AuditLog,
    opts: JobInspectorOptions = {},
  ) {
    this.maxPageSize = opts.maxPageSize ?? 100;
    this.maxLogLines = opts.maxLogLines ?? 200;
  }

  private require(name: string): InspectorQueueLike {
    const q = this.queues.get(name);
    if (!q) throw new UnknownQueueError(name);
    return q;
  }

  async list(
    queue: string,
    state: string,
    page = 1,
    pageSize = 25,
  ): Promise<{ items: JobSummary[]; page: number; pageSize: number }> {
    const q = this.require(queue);
    const size = Math.min(Math.max(1, Math.floor(pageSize)), this.maxPageSize);
    const safePage = Math.max(1, Math.floor(page));
    const start = (safePage - 1) * size;
    const jobs = await q.getJobs([state], start, start + size - 1);
    return { items: jobs.slice(0, size).map(summary), page: safePage, pageSize: size };
  }

  async get(queue: string, id: string): Promise<JobDetail | undefined> {
    const q = this.require(queue);
    const job = await q.getJob(id);
    if (!job) return undefined;
    const state = await job.getState();
    return {
      ...summary(job),
      state,
      data: bounded(job.data),
      opts: bounded(job.opts),
      progress: job.progress,
      returnvalue: bounded(job.returnvalue),
      stacktrace: Array.isArray(job.stacktrace) ? job.stacktrace.slice(0, 20) : [],
    };
  }

  /** The flow position of a job: its parent (if any) and child counts. */
  async tree(queue: string, id: string): Promise<JobTree | undefined> {
    const q = this.require(queue);
    const job = await q.getJob(id);
    if (!job) return undefined;
    const deps = job.getDependenciesCount ? await job.getDependenciesCount() : {};
    return {
      id: String(job.id ?? ''),
      name: job.name,
      parent: job.parent ? { id: job.parent.id } : undefined,
      children: { processed: deps.processed ?? 0, unprocessed: deps.unprocessed ?? 0 },
    };
  }

  async logs(
    queue: string,
    id: string,
    page = 1,
    pageSize = 100,
  ): Promise<{ logs: string[]; count: number }> {
    const q = this.require(queue);
    const size = Math.min(Math.max(1, Math.floor(pageSize)), this.maxLogLines);
    const start = (Math.max(1, Math.floor(page)) - 1) * size;
    return q.getJobLogs(id, start, start + size - 1);
  }

  private async act(
    action: 'retry-job' | 'remove-job' | 'promote-job' | 'discard-job' | 'edit-job',
    queue: string,
    id: string,
    actor: string,
    run: (job: JobLike) => Promise<void>,
  ): Promise<{ ok: boolean }> {
    const q = this.require(queue);
    const job = await q.getJob(id);
    if (!job) return { ok: false };
    await run(job);
    await this.audit.record({ action, queue, actor, detail: { jobId: id } });
    return { ok: true };
  }

  retry(queue: string, id: string, actor: string): Promise<{ ok: boolean }> {
    return this.act('retry-job', queue, id, actor, (j) => j.retry());
  }
  remove(queue: string, id: string, actor: string): Promise<{ ok: boolean }> {
    return this.act('remove-job', queue, id, actor, (j) => j.remove());
  }
  promote(queue: string, id: string, actor: string): Promise<{ ok: boolean }> {
    return this.act('promote-job', queue, id, actor, (j) => j.promote());
  }
  discard(queue: string, id: string, actor: string): Promise<{ ok: boolean }> {
    return this.act('discard-job', queue, id, actor, (j) => (j.discard ? j.discard() : j.remove()));
  }
  edit(queue: string, id: string, actor: string, data: unknown): Promise<{ ok: boolean }> {
    return this.act('edit-job', queue, id, actor, (j) => (j.updateData ? j.updateData(data) : Promise.resolve()));
  }

  /** Re-add a copy of an existing job with the same name, data, and options. */
  async clone(queue: string, id: string, actor: string): Promise<{ ok: boolean; id?: string }> {
    const q = this.require(queue);
    const job = await q.getJob(id);
    if (!job || !q.add) return { ok: false };
    const created = await q.add(job.name, job.data, job.opts);
    await this.audit.record({ action: 'clone-job', queue, actor, detail: { from: id, to: created.id } });
    return created.id !== undefined ? { ok: true, id: created.id } : { ok: true };
  }

  /** Add a new job to a queue. */
  async addJob(
    queue: string,
    actor: string,
    name: string,
    data: unknown,
    opts?: unknown,
  ): Promise<{ ok: boolean; id?: string }> {
    const q = this.require(queue);
    if (!q.add) return { ok: false };
    const created = await q.add(name, data, opts);
    await this.audit.record({ action: 'add-job', queue, actor, detail: { name, id: created.id } });
    return created.id !== undefined ? { ok: true, id: created.id } : { ok: true };
  }

  /** Promote a bounded batch of delayed jobs to waiting. */
  async promoteDelayed(queue: string, actor: string, limit = 1000): Promise<{ promoted: number }> {
    const q = this.require(queue);
    if (!q.getDelayed) return { promoted: 0 };
    const delayed = await q.getDelayed(0, Math.max(0, limit - 1));
    let promoted = 0;
    for (const job of delayed.slice(0, limit)) {
      try {
        await job.promote();
        promoted += 1;
      } catch {
        /* a job that already left delayed is skipped */
      }
    }
    await this.audit.record({ action: 'promote-delayed', queue, actor, detail: { promoted } });
    return { promoted };
  }
}
