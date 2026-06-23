export interface JobCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
  prioritized: number;
  'waiting-children': number;
}

export interface QueueSummary {
  name: string;
  counts: JobCounts;
}

export interface FailedJobView {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

export interface QueueDetail {
  name: string;
  counts: JobCounts;
  dlqSample: FailedJobView[];
}

export interface QueuesPage {
  items: QueueSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export const STATE_ORDER: (keyof JobCounts)[] = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
  'failed',
  'completed',
  'paused',
];
