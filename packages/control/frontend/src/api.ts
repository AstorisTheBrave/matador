import type {
  Alert,
  DlqAnalytics,
  JobDetail,
  JobsPage,
  QueueDetail,
  QueuesPage,
  WorkerInfo,
} from './types.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Typed client for the control-plane API. The token is held in memory only
 * (never persisted) and sent as a bearer header.
 */
export class Api {
  private connection: string | undefined = undefined;

  constructor(
    private readonly base = '',
    private token: string | undefined = undefined,
  ) {}

  setToken(token: string | undefined): void {
    this.token = token && token.length > 0 ? token : undefined;
  }

  setConnection(id: string | undefined): void {
    this.connection = id && id !== 'default' ? id : undefined;
  }

  private withConn(path: string): string {
    if (!this.connection || path.startsWith('/api/connections')) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}connection=${encodeURIComponent(this.connection)}`;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/json');
    const res = await fetch(`${this.base}${this.withConn(path)}`, { ...init, headers });
    if (!res.ok) {
      throw new ApiError(res.status, `Request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  listQueues(page = 1, pageSize = 100): Promise<QueuesPage> {
    return this.req<QueuesPage>(`/api/queues?page=${page}&pageSize=${pageSize}`);
  }

  getQueue(name: string): Promise<QueueDetail> {
    return this.req<QueueDetail>(`/api/queues/${encodeURIComponent(name)}`);
  }

  private post<T>(name: string, action: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method: 'POST' };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return this.req<T>(`/api/queues/${encodeURIComponent(name)}/${action}`, init);
  }

  pause(name: string): Promise<{ paused: boolean }> {
    return this.post(name, 'pause');
  }
  resume(name: string): Promise<{ paused: boolean }> {
    return this.post(name, 'resume');
  }
  retryFailed(name: string, limit?: number): Promise<{ retried: number }> {
    return this.post(name, 'retry-failed', limit ? { limit } : undefined);
  }
  drainDlq(name: string, confirm: string): Promise<{ removed: number }> {
    return this.post(name, 'drain-dlq', { confirm });
  }

  dlqAnalytics(name: string): Promise<DlqAnalytics> {
    return this.req<DlqAnalytics>(`/api/queues/${encodeURIComponent(name)}/dlq/analytics`);
  }

  workers(name: string): Promise<{ workers: WorkerInfo[] }> {
    return this.req<{ workers: WorkerInfo[] }>(`/api/queues/${encodeURIComponent(name)}/workers`);
  }

  metrics(name: string, type: 'completed' | 'failed'): Promise<{ type: string; data: number[]; count: number }> {
    return this.req(`/api/queues/${encodeURIComponent(name)}/metrics?type=${type}`);
  }

  listJobs(name: string, state: string, page = 1, pageSize = 25): Promise<JobsPage> {
    const e = encodeURIComponent;
    return this.req<JobsPage>(`/api/queues/${e(name)}/jobs?state=${e(state)}&page=${page}&pageSize=${pageSize}`);
  }

  getJob(name: string, id: string): Promise<JobDetail> {
    return this.req<JobDetail>(`/api/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}`);
  }

  jobLogs(name: string, id: string): Promise<{ logs: string[]; count: number }> {
    return this.req(`/api/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}/logs`);
  }

  jobAction(name: string, id: string, action: 'retry' | 'remove' | 'promote' | 'discard' | 'clone'): Promise<{ ok: boolean; id?: string }> {
    return this.req(`/api/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
    });
  }

  jobEdit(name: string, id: string, data: unknown): Promise<{ ok: boolean }> {
    return this.req(`/api/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  }

  addJob(name: string, jobName: string, data: unknown, opts?: unknown): Promise<{ ok: boolean; id?: string }> {
    return this.req(`/api/queues/${encodeURIComponent(name)}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: jobName, data, opts }),
    });
  }

  promoteDelayed(name: string): Promise<{ promoted: number }> {
    return this.req(`/api/queues/${encodeURIComponent(name)}/promote-delayed`, { method: 'POST' });
  }

  alerts(): Promise<{ alerts: Alert[] }> {
    return this.req<{ alerts: Alert[] }>('/api/alerts');
  }

  monitors(): Promise<{ config: Record<string, unknown>; active: Alert[] }> {
    return this.req('/api/monitors');
  }

  jobTree(name: string, id: string): Promise<{ id: string; name: string; parent?: { id: string }; children: { processed: number; unprocessed: number } }> {
    return this.req(`/api/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}/tree`);
  }

  connectionList(): Promise<{ connections: { id: string; redisUrl: string; isDefault: boolean }[] }> {
    return this.req('/api/connections');
  }
}
