import { describe, it, expect, vi } from 'vitest';
import { QueueController, type QueueLike } from '../src/queues.js';

function fakeQueue(name: string, counts: Record<string, number>, failed: unknown[] = []): QueueLike {
  return {
    name,
    getJobCounts: vi.fn(async () => counts),
    getFailed: vi.fn(async () => failed),
  };
}

describe('QueueController', () => {
  it('lists queues with counts via one collector snapshot', async () => {
    const a = fakeQueue('a', { waiting: 2 });
    const b = fakeQueue('b', { active: 1 });
    const ctrl = new QueueController(
      new Map([
        ['a', a],
        ['b', b],
      ]),
    );

    const list = await ctrl.list();
    expect(list.map((q) => q.name)).toEqual(['a', 'b']);
    expect(list[0]?.counts.waiting).toBe(2);
    expect(list[1]?.counts.active).toBe(1);
  });

  it('detail returns counts and a bounded, payload-stripped DLQ sample', async () => {
    const failed = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      name: 'job',
      failedReason: 'err',
      data: { pii: 'x' },
    }));
    const q = fakeQueue('emails', { failed: 50 }, failed);
    const ctrl = new QueueController(new Map([['emails', q]]), { dlqSampleLimit: 10 });

    const detail = await ctrl.detail('emails');
    expect(detail?.counts.failed).toBe(50);
    expect(detail?.dlqSample).toHaveLength(10);
    expect(JSON.stringify(detail?.dlqSample)).not.toContain('pii');
  });

  it('detail returns undefined for an unknown queue', async () => {
    const ctrl = new QueueController(new Map());
    expect(await ctrl.detail('nope')).toBeUndefined();
  });
});
