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
  stuck: boolean;
}

export interface JobSummary {
  id: string;
  name: string;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
}

export interface JobDetail extends JobSummary {
  state: string;
  data: unknown;
  opts: unknown;
  progress: unknown;
  returnvalue: unknown;
  stacktrace: string[];
}

export interface JobsPage {
  items: JobSummary[];
  page: number;
  pageSize: number;
}

export interface WorkerInfo {
  name: string;
  addr?: string;
  age?: number;
  idle?: number;
}

export interface FailureGroup {
  reason: string;
  count: number;
  sampleId: string;
}

export interface DlqAnalytics {
  total: number;
  distinct: number;
  groups: FailureGroup[];
}

export interface Alert {
  ts: string;
  monitor: string;
  severity: 'warning' | 'critical';
  queue?: string;
  message: string;
  resolved: boolean;
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
  stuck: boolean;
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
