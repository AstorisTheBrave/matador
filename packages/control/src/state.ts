import { readFile, writeFile, rename } from 'node:fs/promises';

export const SCHEMA_VERSION = 1;

export interface ControlState {
  schemaVersion: number;
  /** Queues the operator has explicitly acknowledged/pinned (optional metadata). */
  knownQueues: string[];
}

export function emptyState(): ControlState {
  return { schemaVersion: SCHEMA_VERSION, knownQueues: [] };
}

/**
 * Load control-plane state. A missing file yields empty state. An unknown schema
 * version is refused (we never truncate or silently reinterpret data we do not
 * understand).
 */
export async function loadState(path: string): Promise<ControlState> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
    throw err;
  }
  const parsed = JSON.parse(raw) as Partial<ControlState>;
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Matador control state at ${path} has unsupported schemaVersion ` +
        `${String(parsed.schemaVersion)} (expected ${SCHEMA_VERSION}); refusing to load.`,
    );
  }
  return { schemaVersion: SCHEMA_VERSION, knownQueues: parsed.knownQueues ?? [] };
}

/** Write state atomically: write a temp file then rename over the target. */
export async function saveState(path: string, state: ControlState): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, path);
}
