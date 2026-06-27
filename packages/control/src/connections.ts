import type { QueueController } from './queues.js';
import type { QueueActions } from './actions.js';
import type { JobInspector } from './jobs.js';

export interface ConnectionSet {
  controller: QueueController;
  actions: QueueActions;
  inspector: JobInspector;
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
}

export type ConnectionFactory = (id: string, redisUrl: string) => Promise<ConnectionSet>;

/** Mask credentials in a Redis URL before exposing it. */
export function maskRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return 'redis://***';
  }
}

/**
 * Holds the named Redis connections the control plane serves. Connections can be
 * registered at startup and (if a factory is provided) added/removed at runtime by
 * an admin. Bounded by `maxConnections`.
 */
export class ConnectionRegistry {
  private readonly sets = new Map<string, ConnectionSet>();
  private readonly urls = new Map<string, string>();

  constructor(
    private readonly defaultId: string,
    private readonly factory?: ConnectionFactory,
    private readonly maxConnections = 50,
  ) {}

  register(id: string, set: ConnectionSet, redisUrl: string): void {
    this.sets.set(id, set);
    this.urls.set(id, redisUrl);
  }

  ids(): string[] {
    return [...this.sets.keys()];
  }
  has(id: string): boolean {
    return this.sets.has(id);
  }
  get(id: string): ConnectionSet | undefined {
    return this.sets.get(id);
  }
  default(): ConnectionSet | undefined {
    return this.sets.get(this.defaultId);
  }

  list(): { id: string; redisUrl: string; isDefault: boolean }[] {
    return [...this.urls.entries()].map(([id, url]) => ({
      id,
      redisUrl: maskRedisUrl(url),
      isDefault: id === this.defaultId,
    }));
  }

  async add(id: string, redisUrl: string): Promise<void> {
    if (!this.factory) throw new Error('runtime connections are not enabled');
    if (this.sets.has(id)) throw new Error(`connection "${id}" already exists`);
    if (this.sets.size >= this.maxConnections) throw new Error('too many connections');
    const set = await this.factory(id, redisUrl);
    this.register(id, set, redisUrl);
  }

  async remove(id: string): Promise<boolean> {
    if (id === this.defaultId) throw new Error('cannot remove the default connection');
    const set = this.sets.get(id);
    if (!set) return false;
    this.sets.delete(id);
    this.urls.delete(id);
    await set.close();
    return true;
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sets.values()].map((s) => s.close().catch(() => undefined)));
  }
}
