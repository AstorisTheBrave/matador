import type { MatadorRegistry } from './registry.js';
import type { JobLabels } from './sink.js';
import { safe } from './failopen.js';

interface MinimalJob {
  id?: string;
  name: string;
  queueName: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  attemptsMade: number;
}

interface MinimalWorker {
  on(event: 'completed', cb: (job: MinimalJob) => void): unknown;
  on(event: 'failed', cb: (job: MinimalJob | undefined) => void): unknown;
}

/**
 * Attach metrics to a BullMQ Worker's own in-process events. The full Job is
 * already in memory here, so we read its timestamps without any extra Redis call
 * (invariant I4). Every handler is fail-open (invariant I3).
 */
export function instrumentWorker(worker: MinimalWorker, reg: MatadorRegistry): void {
  const labelsOf = (job: MinimalJob): JobLabels =>
    reg.config.labelJobName ? { queue: job.queueName, name: job.name } : { queue: job.queueName };

  const onError = () => reg.sink.incInstrumentationError();

  const record = (job: MinimalJob, terminal: 'completed' | 'failed') => {
    safe(() => {
      const labels = labelsOf(job);

      if (job.processedOn && job.finishedOn) {
        reg.sink.observeProcessingSeconds(labels, (job.finishedOn - job.processedOn) / 1000);
      }

      if (job.processedOn && job.id) {
        const wait = reg.waitTracker.waitSeconds(job.id, {
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          attemptsMade: job.attemptsMade,
        });
        reg.sink.observeWaitSeconds(labels, wait);
      }

      if (terminal === 'completed') reg.sink.incCompleted(labels);
      else reg.sink.incFailed(labels);

      if (job.attemptsMade > 1) reg.sink.incRetried(labels);

      if (job.id && job.finishedOn) reg.waitTracker.recordFinish(job.id, job.finishedOn);
    }, onError);
  };

  worker.on('completed', (job) => record(job, 'completed'));
  worker.on('failed', (job) => {
    if (job) record(job, 'failed');
  });
}
