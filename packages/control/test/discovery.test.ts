import { describe, it, expect } from 'vitest';
import { discoverQueueNames } from '../src/discovery.js';

/** A fake Redis that returns all keys in one SCAN page. */
function fakeRedis(keys: string[]) {
  return {
    scan: async (cursor: string) => (cursor === '0' ? ['0', keys] : ['0', []]) as [string, string[]],
  };
}

describe('discoverQueueNames', () => {
  it('extracts queue names from meta keys, including names with colons', async () => {
    const names = await discoverQueueNames(
      fakeRedis(['bull:emails:meta', 'bull:a:b:meta', 'bull:emails:id', 'other:x:meta']),
    );
    expect(names).toEqual(['a:b', 'emails']);
  });

  it('respects a custom prefix', async () => {
    const names = await discoverQueueNames(fakeRedis(['mq:jobs:meta']), 'mq');
    expect(names).toEqual(['jobs']);
  });
});
