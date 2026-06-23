import type { AuditLog } from './audit.js';
import { ConfirmRequiredError, UnknownQueueError } from './errors.js';

export interface JobOpsLike {
  id?: string;
  retry(): Promise<void>;
  remove(): Promise<void>;
}

export interface QueueOpsLike {
  name: string;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getFailed(start: number, end: number): Promise<JobOpsLike[]>;
}

export interface QueueActionsOptions {
  /** Max failed jobs retried per call. */
  retryBatchLimit?: number;
  /** Max failed jobs removed per drain call. */
  drainBatchLimit?: number;
}

/**
 * Safe operational actions over BullMQ queues. All actions are idempotent and
 * audited; the destructive drain requires a confirm token matching the queue name
 * and operates on a bounded batch (a fat-fingered request cannot wipe a huge
 * queue in one shot, and never touches non-DLQ jobs).
 */
export class QueueActions {
  private readonly retryBatchLimit: number;
  private readonly drainBatchLimit: number;

  constructor(
    private readonly queues: Map<string, QueueOpsLike>,
    private readonly audit: AuditLog,
    opts: QueueActionsOptions = {},
  ) {
    this.retryBatchLimit = opts.retryBatchLimit ?? 100;
    this.drainBatchLimit = opts.drainBatchLimit ?? 1000;
  }

  private require(name: string): QueueOpsLike {
    const q = this.queues.get(name);
    if (!q) throw new UnknownQueueError(name);
    return q;
  }

  async pause(name: string, actor: string): Promise<{ paused: boolean }> {
    const q = this.require(name);
    await q.pause();
    await this.audit.record({ action: 'pause', queue: name, actor });
    return { paused: true };
  }

  async resume(name: string, actor: string): Promise<{ paused: boolean }> {
    const q = this.require(name);
    await q.resume();
    await this.audit.record({ action: 'resume', queue: name, actor });
    return { paused: false };
  }

  async retryFailed(name: string, actor: string, limit?: number): Promise<{ retried: number }> {
    const q = this.require(name);
    const max = Math.min(limit ?? this.retryBatchLimit, this.retryBatchLimit);
    const failed = await q.getFailed(0, Math.max(0, max - 1));
    let retried = 0;
    for (const job of failed.slice(0, max)) {
      try {
        await job.retry();
        retried += 1;
      } catch {
        /* a job that is no longer retryable is skipped, not fatal */
      }
    }
    await this.audit.record({ action: 'retry-failed', queue: name, actor, detail: { retried } });
    return { retried };
  }

  async drainDlq(name: string, actor: string, confirm: string): Promise<{ removed: number }> {
    const q = this.require(name);
    if (confirm !== name) throw new ConfirmRequiredError(name);
    const failed = await q.getFailed(0, Math.max(0, this.drainBatchLimit - 1));
    let removed = 0;
    for (const job of failed.slice(0, this.drainBatchLimit)) {
      try {
        await job.remove();
        removed += 1;
      } catch {
        /* skip a job that vanished between read and remove */
      }
    }
    await this.audit.record({ action: 'drain-dlq', queue: name, actor, detail: { removed } });
    return { removed };
  }
}
