import { describe, it, expect, vi } from 'vitest';
import { MultiSink } from '../src/multi-sink.js';
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

describe('MultiSink', () => {
  it('fans every call out to all sinks', () => {
    const a = fakeSink();
    const b = fakeSink();
    const multi = new MultiSink([a, b]);

    multi.observeProcessingSeconds({ queue: 'q' }, 0.5);
    multi.observeWaitSeconds({ queue: 'q' }, 0.2);
    multi.incCompleted({ queue: 'q' });
    multi.incFailed({ queue: 'q' });
    multi.incRetried({ queue: 'q' });
    multi.incInstrumentationError();

    for (const s of [a, b]) {
      expect(s.observeProcessingSeconds).toHaveBeenCalledWith({ queue: 'q' }, 0.5);
      expect(s.observeWaitSeconds).toHaveBeenCalledWith({ queue: 'q' }, 0.2);
      expect(s.incCompleted).toHaveBeenCalledWith({ queue: 'q' });
      expect(s.incFailed).toHaveBeenCalledWith({ queue: 'q' });
      expect(s.incRetried).toHaveBeenCalledWith({ queue: 'q' });
      expect(s.incInstrumentationError).toHaveBeenCalled();
    }
  });

  it('one throwing sink does not stop the others or throw (I3)', () => {
    const bad: MetricsSink = {
      ...NoopSink,
      incCompleted: () => {
        throw new Error('boom');
      },
    };
    const good = fakeSink();
    const multi = new MultiSink([bad, good]);

    expect(() => multi.incCompleted({ queue: 'q' })).not.toThrow();
    expect(good.incCompleted).toHaveBeenCalledWith({ queue: 'q' });
  });
});
