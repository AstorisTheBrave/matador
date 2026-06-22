import { bench, describe } from 'vitest';
import { EventEmitter } from 'node:events';
import { instrumentWorker } from '../src/instrument-worker.js';
import { MatadorRegistry } from '../src/registry.js';
import { resolveConfig } from '../src/config.js';
import { NoopSink } from '../src/sink.js';

const job = {
  id: 'j',
  name: 'n',
  queueName: 'q',
  timestamp: 1000,
  processedOn: 1500,
  finishedOn: 2000,
  attemptsMade: 1,
};

describe('worker instrumentation overhead (I4)', () => {
  bench('baseline emit (no instrumentation)', () => {
    const w = new EventEmitter();
    w.on('completed', () => {});
    for (let i = 0; i < 1000; i++) w.emit('completed', job);
  });

  bench('instrumented emit (NoopSink)', () => {
    const w = new EventEmitter();
    instrumentWorker(w as never, new MatadorRegistry(NoopSink, resolveConfig()));
    for (let i = 0; i < 1000; i++) w.emit('completed', job);
  });
});
