import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveState, emptyState, SCHEMA_VERSION } from '../src/state.js';

let dir: string | undefined;
async function tmp(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'matador-state-'));
  return dir;
}
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('control state', () => {
  it('returns empty state when the file is missing', async () => {
    const d = await tmp();
    const s = await loadState(join(d, 'state.json'));
    expect(s).toEqual(emptyState());
  });

  it('round-trips and writes atomically (no temp left behind)', async () => {
    const d = await tmp();
    const path = join(d, 'state.json');
    await saveState(path, { schemaVersion: SCHEMA_VERSION, knownQueues: ['emails'] });
    const s = await loadState(path);
    expect(s.knownQueues).toEqual(['emails']);
    expect(await readdir(d)).toEqual(['state.json']); // no .tmp
  });

  it('refuses an unknown schema version (never truncates)', async () => {
    const d = await tmp();
    const path = join(d, 'state.json');
    await writeFile(path, JSON.stringify({ schemaVersion: 999, knownQueues: [] }), 'utf8');
    await expect(loadState(path)).rejects.toThrow(/unsupported schemaVersion/);
  });
});
