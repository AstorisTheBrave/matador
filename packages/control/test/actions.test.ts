import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QueueActions, type QueueOpsLike, type JobOpsLike } from '../src/actions.js';
import { AuditLog } from '../src/audit.js';
import { ConfirmRequiredError, UnknownQueueError } from '../src/errors.js';

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function newAudit(): Promise<AuditLog> {
  dir = await mkdtemp(join(tmpdir(), 'matador-actions-'));
  return new AuditLog(join(dir, 'audit.jsonl'));
}

function job(id: string, retry = vi.fn(async () => {}), remove = vi.fn(async () => {})): JobOpsLike {
  return { id, retry, remove };
}

function fakeQueue(name: string, failed: JobOpsLike[] = []): QueueOpsLike {
  return {
    name,
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    getFailed: vi.fn(async () => failed),
  };
}

describe('QueueActions', () => {
  it('pause is idempotent and audited each time', async () => {
    const audit = await newAudit();
    const q = fakeQueue('emails');
    const actions = new QueueActions(new Map([['emails', q]]), audit);

    expect(await actions.pause('emails', 'ops')).toEqual({ paused: true });
    expect(await actions.pause('emails', 'ops')).toEqual({ paused: true });
    expect(q.pause).toHaveBeenCalledTimes(2);
    const log = await audit.readAll();
    expect(log.filter((e) => e.action === 'pause')).toHaveLength(2);
  });

  it('retry-failed retries a bounded batch and skips un-retryable jobs', async () => {
    const audit = await newAudit();
    const good = job('1');
    const bad = job(
      '2',
      vi.fn(async () => {
        throw new Error('not failed anymore');
      }),
    );
    const q = fakeQueue('emails', [good, bad]);
    const actions = new QueueActions(new Map([['emails', q]]), audit, { retryBatchLimit: 50 });

    const res = await actions.retryFailed('emails', 'ops');
    expect(res.retried).toBe(1); // good retried, bad skipped
    expect(good.retry).toHaveBeenCalled();
    expect((await audit.readAll()).some((e) => e.action === 'retry-failed')).toBe(true);
  });

  it('drain-dlq requires the confirm token and never removes without it', async () => {
    const audit = await newAudit();
    const j = job('1');
    const q = fakeQueue('emails', [j]);
    const actions = new QueueActions(new Map([['emails', q]]), audit);

    await expect(actions.drainDlq('emails', 'ops', 'wrong')).rejects.toBeInstanceOf(
      ConfirmRequiredError,
    );
    expect(j.remove).not.toHaveBeenCalled();
    expect(await audit.readAll()).toHaveLength(0); // nothing audited on refusal

    const res = await actions.drainDlq('emails', 'ops', 'emails');
    expect(res.removed).toBe(1);
    expect(j.remove).toHaveBeenCalled();
    expect((await audit.readAll()).some((e) => e.action === 'drain-dlq')).toBe(true);
  });

  it('throws UnknownQueueError for an unknown queue', async () => {
    const audit = await newAudit();
    const actions = new QueueActions(new Map(), audit);
    await expect(actions.pause('nope', 'ops')).rejects.toBeInstanceOf(UnknownQueueError);
  });
});
