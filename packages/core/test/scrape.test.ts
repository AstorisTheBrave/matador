import { describe, it, expect, vi } from 'vitest';
import { QueueDepthCollector, type JobCounts } from '../src/scrape.js';

const zeros: JobCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
  paused: 0,
  prioritized: 0,
  'waiting-children': 0,
};

describe('QueueDepthCollector', () => {
  it('single-flight: concurrent snapshots make one getJobCounts call per queue', async () => {
    const onError = vi.fn();
    const c = new QueueDepthCollector(5000, onError);
    const getJobCounts = vi.fn(async () => ({ waiting: 2, active: 1 }));
    c.register({ name: 'q', getJobCounts });

    const [a, b] = await Promise.all([c.snapshot(), c.snapshot()]);

    expect(getJobCounts).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.get('q')).toEqual({ ...zeros, waiting: 2, active: 1 });
  });

  it('caches within TTL and refetches after it expires', async () => {
    const onError = vi.fn();
    let now = 1000;
    const c = new QueueDepthCollector(5000, onError, () => now);
    const getJobCounts = vi.fn(async () => ({ waiting: 1 }));
    c.register({ name: 'q', getJobCounts });

    await c.snapshot();
    await c.snapshot(); // within TTL -> cached
    expect(getJobCounts).toHaveBeenCalledTimes(1);

    now += 6000; // past TTL
    await c.snapshot();
    expect(getJobCounts).toHaveBeenCalledTimes(2);
  });

  it('fails open: a queue whose getJobCounts rejects yields zeros and counts the error', async () => {
    const onError = vi.fn();
    const c = new QueueDepthCollector(5000, onError);
    c.register({
      name: 'q',
      getJobCounts: vi.fn(async () => {
        throw new Error('redis down');
      }),
    });

    const snap = await c.snapshot();

    expect(snap.get('q')).toEqual(zeros);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('times out a hung getJobCounts and fails open (reliability)', async () => {
    const onError = vi.fn();
    const c = new QueueDepthCollector(5000, onError, () => Date.now(), 20);
    c.register({
      name: 'q',
      getJobCounts: () => new Promise(() => {}), // never resolves
    });

    const snap = await c.snapshot();

    expect(snap.get('q')).toEqual(zeros);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
