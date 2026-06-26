/**
 * Normalize a failure message so variable parts (uuids, numbers, hex, paths)
 * collapse to placeholders. This stops a stream of unique-per-failure messages
 * from exploding the distinct-reason set (bounded analytics, invariant I5 spirit).
 */
export function normalizeReason(message: string, maxLen = 140): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/[A-Za-z]:\\[^\s"']+/g, '<path>')
    .replace(/(?:\/[\w.-]+)+/g, '<path>')
    .replace(/\d+(?:[.,]\d+)*/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export interface FailureGroup {
  reason: string;
  count: number;
  sampleId: string;
}

export interface DlqAnalytics {
  total: number;
  distinct: number;
  groups: FailureGroup[];
}

interface RawFailed {
  id?: string;
  failedReason?: string;
}

/**
 * Group failed jobs by normalized reason, returning the top-N plus an "<other>"
 * bucket so the output is bounded regardless of how many distinct messages exist.
 */
export function groupFailures(jobs: RawFailed[], topN = 10): DlqAnalytics {
  const map = new Map<string, { count: number; sampleId: string }>();
  for (const j of jobs) {
    const reason = normalizeReason(String(j.failedReason ?? '')) || '<empty>';
    const existing = map.get(reason);
    if (existing) existing.count += 1;
    else map.set(reason, { count: 1, sampleId: String(j.id ?? '') });
  }
  const all = [...map.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, sampleId: v.sampleId }))
    .sort((a, b) => b.count - a.count);

  let groups = all.slice(0, topN);
  if (all.length > topN) {
    const otherCount = all.slice(topN).reduce((sum, g) => sum + g.count, 0);
    groups = [...groups, { reason: '<other>', count: otherCount, sampleId: '' }];
  }
  return { total: jobs.length, distinct: all.length, groups };
}
