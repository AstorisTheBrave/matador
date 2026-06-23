import type { QueueDetail, QueuesPage } from './types.js';

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
  constructor(
    private readonly base = '',
    private token: string | undefined = undefined,
  ) {}

  setToken(token: string | undefined): void {
    this.token = token && token.length > 0 ? token : undefined;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/json');
    const res = await fetch(`${this.base}${path}`, { ...init, headers });
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
}
