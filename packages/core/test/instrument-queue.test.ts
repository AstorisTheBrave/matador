import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { instrument } from '../src/index.js';
import type { MetricsSink } from '../src/sink.js';

function fakeSink(): MetricsSink {
  return {
    observeProcessingSeconds: vi.fn(),
    observeWaitSeconds: vi.fn(),
    incCompleted: vi.fn(),
    incFailed: vi.fn(),
    incRetried: vi.fn(),
    incInstrumentationError: vi.fn(),
  };
}

describe('instrument auto-detect', () => {
  it('instrument(queue) registers the queue with the depth collector', async () => {
    const sink = fakeSink();
    const getJobCounts = vi.fn(async () => ({ waiting: 3, active: 1 }));
    const reg = instrument({ name: 'emails', getJobCounts } as never, { sink });

    const snap = await reg.depthCollector.snapshot();

    expect(snap.get('emails')?.waiting).toBe(3);
    expect(snap.get('emails')?.active).toBe(1);
  });

  it('instrument(worker) still wires worker events', () => {
    const sink = fakeSink();
    const worker = new EventEmitter();
    instrument(worker as never, { sink });

    worker.emit('completed', {
      id: 'j',
      name: 'n',
      queueName: 'q',
      timestamp: 1000,
      processedOn: 1500,
      finishedOn: 2000,
      attemptsMade: 1,
    });

    expect(sink.incCompleted).toHaveBeenCalledWith({ queue: 'q' });
  });

  it('respects MATADOR_SCRAPE_CACHE_TTL_MS via config', async () => {
    const sink = fakeSink();
    const reg = instrument({ name: 'q', getJobCounts: vi.fn(async () => ({})) } as never, {
      sink,
      scrapeCacheTtlMs: 1234,
    });
    expect(reg.config.scrapeCacheTtlMs).toBe(1234);
  });
});
