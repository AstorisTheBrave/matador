import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobInspector, type JobLike, type InspectorQueueLike } from '../src/jobs.js';
import { AuditLog } from '../src/audit.js';
import { UnknownQueueError } from '../src/errors.js';

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});
async function newAudit(): Promise<AuditLog> {
  dir = await mkdtemp(join(tmpdir(), 'matador-jobs-'));
  return new AuditLog(join(dir, 'audit.jsonl'));
}

function job(id: string, over: Partial<JobLike> = {}): JobLike {
  return {
    id,
    name: 'send',
    data: { to: 'a@b.c' },
    opts: { attempts: 3 },
    progress: 0,
    returnvalue: null,
    stacktrace: [],
    attemptsMade: 1,
    timestamp: 1000,
    getState: vi.fn(async () => 'failed'),
    retry: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    promote: vi.fn(async () => {}),
    ...over,
  };
}

function fakeQueue(jobs: JobLike[]): InspectorQueueLike {
  const byId = new Map(jobs.map((j) => [j.id!, j]));
  return {
    name: 'emails',
    getJobs: vi.fn(async (_types, start, end) => jobs.slice(start, end + 1)),
    getJob: vi.fn(async (id) => byId.get(id)),
    getJobLogs: vi.fn(async () => ({ logs: ['line 1', 'line 2'], count: 2 })),
  };
}

describe('JobInspector', () => {
  it('lists jobs by state with bounded pagination', async () => {
    const audit = await newAudit();
    const jobs = Array.from({ length: 50 }, (_, i) => job(String(i)));
    const insp = new JobInspector(new Map([['emails', fakeQueue(jobs)]]), audit);
    const res = await insp.list('emails', 'failed', 1, 10);
    expect(res.items).toHaveLength(10);
    expect(res.items[0]?.id).toBe('0');
  });

  it('returns sanitized job detail with bounded data', async () => {
    const audit = await newAudit();
    const huge = { blob: 'x'.repeat(100_000) };
    const insp = new JobInspector(new Map([['emails', fakeQueue([job('1', { data: huge })])]]), audit);
    const detail = await insp.get('emails', '1');
    expect(detail?.state).toBe('failed');
    expect(detail?.id).toBe('1');
    expect(JSON.stringify(detail?.data)).toContain('truncated');
  });

  it('retries/removes/promotes a job and audits it', async () => {
    const audit = await newAudit();
    const j = job('1');
    const insp = new JobInspector(new Map([['emails', fakeQueue([j])]]), audit);

    expect(await insp.retry('emails', '1', 'ops')).toEqual({ ok: true });
    expect(j.retry).toHaveBeenCalled();
    expect(await insp.remove('emails', '1', 'ops')).toEqual({ ok: true });
    expect(await insp.promote('emails', '1', 'ops')).toEqual({ ok: true });

    const log = await audit.readAll();
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(['retry-job', 'remove-job', 'promote-job']),
    );
  });

  it('returns ok:false for a missing job and throws for an unknown queue', async () => {
    const audit = await newAudit();
    const insp = new JobInspector(new Map([['emails', fakeQueue([])]]), audit);
    expect(await insp.retry('emails', 'nope', 'ops')).toEqual({ ok: false });
    await expect(insp.list('other', 'failed')).rejects.toBeInstanceOf(UnknownQueueError);
  });

  it('discards, edits, clones, adds, and promotes delayed jobs (audited)', async () => {
    const audit = await newAudit();
    const j = job('1', {
      discard: vi.fn(async () => {}),
      updateData: vi.fn(async () => {}),
      promote: vi.fn(async () => {}),
    });
    const delayed = [job('d1'), job('d2')];
    const add = vi.fn(async () => ({ id: 'new-1' }));
    const q = {
      name: 'emails',
      getJobs: vi.fn(async () => []),
      getJob: vi.fn(async (id) => (id === '1' ? j : undefined)),
      getJobLogs: vi.fn(async () => ({ logs: [], count: 0 })),
      add,
      getDelayed: vi.fn(async () => delayed),
    };
    const insp = new JobInspector(new Map([['emails', q]]), audit);

    expect(await insp.discard('emails', '1', 'ops')).toEqual({ ok: true });
    expect(j.discard).toHaveBeenCalled();
    expect(await insp.edit('emails', '1', 'ops', { x: 1 })).toEqual({ ok: true });
    expect(j.updateData).toHaveBeenCalledWith({ x: 1 });
    expect(await insp.clone('emails', '1', 'ops')).toEqual({ ok: true, id: 'new-1' });
    expect(await insp.addJob('emails', 'ops', 'send', { to: 'a' })).toEqual({ ok: true, id: 'new-1' });
    expect(add).toHaveBeenCalledTimes(2);
    expect(await insp.promoteDelayed('emails', 'ops')).toEqual({ promoted: 2 });

    const actions = (await audit.readAll()).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['discard-job', 'edit-job', 'clone-job', 'add-job', 'promote-delayed']),
    );
  });
});
