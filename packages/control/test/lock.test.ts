import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateLock } from '../src/lock.js';

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('StateLock', () => {
  it('acquires when free, refuses a second holder, and re-acquires after release', async () => {
    dir = await mkdtemp(join(tmpdir(), 'matador-lock-'));
    const path = join(dir, 'control.lock');

    const a = new StateLock(path);
    await a.acquire();

    const b = new StateLock(path);
    await expect(b.acquire()).rejects.toThrow(/holds the lock/);

    await a.release();
    const c = new StateLock(path);
    await expect(c.acquire()).resolves.toBeUndefined();
    await c.release();
  });
});
