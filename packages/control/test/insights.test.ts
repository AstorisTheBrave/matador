import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QueueController, type QueueLike } from '../src/queues.js';
import { JobInspector, type InspectorQueueLike, type JobLike } from '../src/jobs.js';
import { AuditLog } from '../src/audit.js';

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('workers and metrics (QueueController)', () => {
  it('lists workers (bounded, sanitized)', async () => {
    const q: QueueLike = {
      name: 'emails',
      getJobCounts: async () => ({}),
      getFailed: async () => [],
      getWorkers: async () => [{ name: 'w1', addr: '10.0.0.1', age: 5, idle: 1, secret: 'x' }],
    };
    const ctrl = new QueueController(new Map([['emails', q]]));
    const ws = await ctrl.workers('emails');
    expect(ws).toEqual([{ name: 'w1', addr: '10.0.0.1', age: 5, idle: 1 }]);
    expect(JSON.stringify(ws)).not.toContain('secret');
  });

  it('returns per-minute metrics, empty when unsupported', async () => {
    const withMetrics: QueueLike = {
      name: 'emails',
      getJobCounts: async () => ({}),
      getFailed: async () => [],
      getMetrics: async (type) => ({ data: [1, 2, 3], count: 6, meta: { type } }),
    };
    const ctrl = new QueueController(new Map([['emails', withMetrics]]));
    expect(await ctrl.metrics('emails', 'completed')).toEqual({ type: 'completed', data: [1, 2, 3], count: 6 });

    const noMetrics = new QueueController(
      new Map([['q', { name: 'q', getJobCounts: async () => ({}), getFailed: async () => [] }]]),
    );
    expect(await noMetrics.metrics('q', 'failed')).toEqual({ type: 'failed', data: [], count: 0 });
  });

  it('returns undefined for an unknown queue', async () => {
    const ctrl = new QueueController(new Map());
    expect(await ctrl.workers('nope')).toBeUndefined();
    expect(await ctrl.metrics('nope', 'completed')).toBeUndefined();
  });
});

describe('flows / job tree (JobInspector)', () => {
  it('returns parent and child counts', async () => {
    dir = await mkdtemp(join(tmpdir(), 'matador-tree-'));
    const audit = new AuditLog(join(dir, 'a.jsonl'));
    const child: JobLike = {
      id: 'c1',
      name: 'child',
      data: {},
      opts: {},
      progress: 0,
      returnvalue: null,
      stacktrace: [],
      attemptsMade: 1,
      timestamp: 1,
      parent: { id: 'p1' },
      getState: vi.fn(async () => 'completed'),
      retry: vi.fn(),
      remove: vi.fn(),
      promote: vi.fn(),
      getDependenciesCount: vi.fn(async () => ({ processed: 2, unprocessed: 1 })),
    };
    const q: InspectorQueueLike = {
      name: 'flows',
      getJobs: async () => [],
      getJob: async (id) => (id === 'c1' ? child : undefined),
      getJobLogs: async () => ({ logs: [], count: 0 }),
    };
    const insp = new JobInspector(new Map([['flows', q]]), audit);
    const tree = await insp.tree('flows', 'c1');
    expect(tree?.parent).toEqual({ id: 'p1' });
    expect(tree?.children).toEqual({ processed: 2, unprocessed: 1 });
    expect(await insp.tree('flows', 'nope')).toBeUndefined();
  });
});
