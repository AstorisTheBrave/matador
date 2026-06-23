import { writeFile, rm } from 'node:fs/promises';

/**
 * A cross-platform advisory single-writer lock backed by exclusive file creation.
 * A second instance pointed at the same lock path refuses to start rather than
 * corrupt shared state.
 */
export class StateLock {
  private held = false;

  constructor(private readonly path: string) {}

  async acquire(): Promise<void> {
    try {
      await writeFile(this.path, `${process.pid}\n`, { flag: 'wx' });
      this.held = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(
          `Another Matador control-plane instance holds the lock at ${this.path}. ` +
            `Stop it first, or remove the stale lock file if no instance is running.`,
        );
      }
      throw err;
    }
  }

  async release(): Promise<void> {
    if (!this.held) return;
    await rm(this.path, { force: true });
    this.held = false;
  }
}
