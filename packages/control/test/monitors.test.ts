import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateBreaches, MonitorEngine, AlertLog, type MonitorContext } from '../src/monitors.js';
import type { Notifier, Alert } from '../src/notifier.js';
import { validateWebhookUrl } from '../src/notifier.js';

const counts = (over: Partial<MonitorContext['queues'][0]['counts']> = {}) => ({
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
  completed: 0,
  paused: 0,
  prioritized: 0,
  'waiting-children': 0,
  ...over,
});

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('validateWebhookUrl', () => {
  it('accepts http/https and rejects others', () => {
    expect(validateWebhookUrl('https://hooks.slack.com/x')).toContain('https://');
    expect(() => validateWebhookUrl('file:///etc/passwd')).toThrow(/http or https/);
  });
});

describe('evaluateBreaches', () => {
  it('flags backlog, failed, missing workers, memory, and connection', () => {
    const ctx: MonitorContext = {
      queues: [{ name: 'emails', counts: counts({ waiting: 50, failed: 10, active: 1 }), workers: 0 }],
      redis: { reachable: false, usedMemoryBytes: 2_000 },
    };
    const breaches = evaluateBreaches(
      { backlogThreshold: 10, failedThreshold: 5, missingWorkers: true, maxMemoryBytes: 1_000, connection: true },
      ctx,
      'now',
    );
    expect([...breaches.keys()].sort()).toEqual(['backlog:emails', 'connection', 'failed:emails', 'memory', 'workers:emails']);
  });
});

describe('MonitorEngine', () => {
  it('fires once on a new breach, de-dups, then resolves when it clears', async () => {
    dir = await mkdtemp(join(tmpdir(), 'matador-mon-'));
    const history = new AlertLog(join(dir, 'alerts.jsonl'));
    const sink: Notifier & { calls: Alert[] } = {
      calls: [],
      notify: vi.fn(async function (this: { calls: Alert[] }, a: Alert) {
        this.calls.push(a);
      }),
    } as never;
    const engine = new MonitorEngine({ backlogThreshold: 10 }, [sink], history);

    const breached: MonitorContext = {
      queues: [{ name: 'q', counts: counts({ waiting: 50 }), workers: 1 }],
      redis: { reachable: true },
    };
    const clear: MonitorContext = {
      queues: [{ name: 'q', counts: counts({ waiting: 1 }), workers: 1 }],
      redis: { reachable: true },
    };

    const first = await engine.runOnce(breached);
    expect(first).toHaveLength(1);
    expect(first[0]?.resolved).toBe(false);

    const second = await engine.runOnce(breached); // still breached -> no new fire
    expect(second).toHaveLength(0);

    const third = await engine.runOnce(clear); // recovered -> resolve
    expect(third).toHaveLength(1);
    expect(third[0]?.resolved).toBe(true);

    const log = await history.readAll();
    expect(log).toHaveLength(2); // fire + resolve
    expect(engine.current()).toHaveLength(0);
  });
});
