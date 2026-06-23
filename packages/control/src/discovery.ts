interface ScanRedis {
  scan(
    cursor: string,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number,
  ): Promise<[string, string[]]>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Discover BullMQ queue names from Redis by scanning for `${prefix}:<name>:meta`
 * keys. Cursor-based SCAN, so it is safe on large keyspaces. Queue names may
 * contain colons (the trailing `:meta` is matched non-greedily at the end).
 */
export async function discoverQueueNames(redis: ScanRedis, prefix = 'bull'): Promise<string[]> {
  const names = new Set<string>();
  const re = new RegExp(`^${escapeRegExp(prefix)}:(.+):meta$`);
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*:meta`, 'COUNT', 500);
    cursor = next;
    for (const key of keys) {
      const m = re.exec(key);
      if (m && m[1]) names.add(m[1]);
    }
  } while (cursor !== '0');
  return [...names].sort();
}
