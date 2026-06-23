import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLog } from '../src/audit.js';

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('AuditLog', () => {
  it('appends entries with a server-stamped timestamp, in order', async () => {
    dir = await mkdtemp(join(tmpdir(), 'matador-audit-'));
    const path = join(dir, 'audit.jsonl');
    const log = new AuditLog(path, () => 1_700_000_000_000);

    await log.record({ action: 'pause', queue: 'emails', actor: 'ops' });
    await log.record({ action: 'drain-dlq', queue: 'emails', actor: 'ops', detail: { removed: 5 } });

    const entries = await log.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ action: 'pause', queue: 'emails', actor: 'ops' });
    expect(entries[0]?.ts).toBe(new Date(1_700_000_000_000).toISOString());
    expect(entries[1]?.detail).toEqual({ removed: 5 });
  });

  it('returns [] when the log does not exist yet', async () => {
    dir = await mkdtemp(join(tmpdir(), 'matador-audit-'));
    const log = new AuditLog(join(dir, 'nope.jsonl'));
    expect(await log.readAll()).toEqual([]);
  });
});
