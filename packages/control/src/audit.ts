import { appendFile, readFile } from 'node:fs/promises';

export type AuditAction = 'pause' | 'resume' | 'retry-failed' | 'drain-dlq';

export interface AuditEntry {
  /** Server-stamped ISO timestamp (never trusted from the client). */
  ts: string;
  action: AuditAction;
  queue: string;
  /** Which token acted ('viewer' is never allowed to act; 'ops' or a label). */
  actor: string;
  detail?: Record<string, unknown>;
}

/** Append-only JSONL audit log of operational actions. */
export class AuditLog {
  constructor(
    private readonly path: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async record(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
    const full: AuditEntry = { ts: new Date(this.now()).toISOString(), ...entry };
    await appendFile(this.path, `${JSON.stringify(full)}\n`, 'utf8');
  }

  /** Read entries (most recent last). Returns [] if the log does not exist yet. */
  async readAll(): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return raw
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as AuditEntry);
  }
}
