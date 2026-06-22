import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { instrumentWorker } from '../src/instrument-worker.js';
import { MatadorRegistry } from '../src/registry.js';
import { resolveConfig } from '../src/config.js';
import { NoopSink, type MetricsSink } from '../src/sink.js';

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

const job = (over: Record<string, unknown> = {}) => ({
  id: 'j1',
  name: 'send-email',
  queueName: 'emails',
  timestamp: 1000,
  processedOn: 1500,
  finishedOn: 2000,
  attemptsMade: 1,
  ...over,
});

describe('instrumentWorker', () => {
  it('records processing + wait + completed on completed event', () => {
    const sink = fakeSink();
    const worker = new EventEmitter();
    instrumentWorker(worker as never, new MatadorRegistry(sink, resolveConfig()));
    worker.emit('completed', job());
    expect(sink.observeProcessingSeconds).toHaveBeenCalledWith({ queue: 'emails' }, 0.5);
    expect(sink.observeWaitSeconds).toHaveBeenCalledWith({ queue: 'emails' }, 0.5);
    expect(sink.incCompleted).toHaveBeenCalledWith({ queue: 'emails' });
  });

  it('includes job name label only when configured (I5)', () => {
    const sink = fakeSink();
    const worker = new EventEmitter();
    instrumentWorker(worker as never, new MatadorRegistry(sink, resolveConfig({ labelJobName: true })));
    worker.emit('completed', job());
    expect(sink.incCompleted).toHaveBeenCalledWith({ queue: 'emails', name: 'send-email' });
  });

  it('never throws into the worker when the sink throws (I3)', () => {
    const sink = {
      ...NoopSink,
      incCompleted: () => {
        throw new Error('x');
      },
      incInstrumentationError: vi.fn(),
    };
    const worker = new EventEmitter();
    instrumentWorker(worker as never, new MatadorRegistry(sink, resolveConfig()));
    expect(() => worker.emit('completed', job())).not.toThrow();
    expect(sink.incInstrumentationError).toHaveBeenCalled();
  });

  it('counts a retry on failed with attemptsMade > 1', () => {
    const sink = fakeSink();
    const worker = new EventEmitter();
    instrumentWorker(worker as never, new MatadorRegistry(sink, resolveConfig()));
    worker.emit('failed', job({ attemptsMade: 2 }));
    expect(sink.incFailed).toHaveBeenCalledWith({ queue: 'emails' });
    expect(sink.incRetried).toHaveBeenCalledWith({ queue: 'emails' });
  });

  it('ignores a failed event with no job (drained/unknown)', () => {
    const sink = fakeSink();
    const worker = new EventEmitter();
    instrumentWorker(worker as never, new MatadorRegistry(sink, resolveConfig()));
    expect(() => worker.emit('failed', undefined)).not.toThrow();
    expect(sink.incFailed).not.toHaveBeenCalled();
  });
});
