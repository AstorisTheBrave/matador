import type { AlertRule, RuleGroup, SloConfig } from './rules.js';

/** Error ratio for a wait-time SLO over a window: fraction of jobs over the threshold. */
function errorRatio(ns: string, slo: SloConfig, window: string): string {
  const le = String(slo.waitThresholdSeconds);
  const qBucket = slo.queue !== undefined ? `,queue="${slo.queue}"` : '';
  const qCount = slo.queue !== undefined ? `{queue="${slo.queue}"}` : '';
  return (
    `1 - (sum(rate(${ns}_job_wait_seconds_bucket{le="${le}"${qBucket}}[${window}]))` +
    ` / sum(rate(${ns}_job_wait_seconds_count${qCount}[${window}])))`
  );
}

function sloName(slo: SloConfig): string {
  return slo.queue !== undefined ? `queue ${slo.queue}` : 'fleet';
}

/**
 * Multi-window multi-burn-rate alerts for each wait-time SLO (Google SRE style):
 * a fast pair (1h and 5m at 14.4x budget) pages, a slow pair (6h and 30m at 6x)
 * tickets. Both windows in a pair must breach, which suppresses false positives.
 */
export function generateBurnRateRules(slos: SloConfig[], ns = 'matador'): RuleGroup {
  const rules: AlertRule[] = [];
  for (const slo of slos) {
    const eb = 1 - slo.objective;
    const fast = (14.4 * eb).toPrecision(3);
    const slow = (6 * eb).toPrecision(3);
    const where = sloName(slo);
    const suffix = slo.queue !== undefined ? `:${slo.queue}` : '';

    rules.push({
      alert: `MatadorWaitSLOFastBurn${suffix}`,
      expr:
        `(${errorRatio(ns, slo, '1h')} > ${fast})` +
        ` and (${errorRatio(ns, slo, '5m')} > ${fast})`,
      for: '2m',
      labels: { severity: 'critical', slo: 'wait' },
      annotations: {
        summary: `Fast wait-time SLO burn (${where})`,
        description: `Burning the ${slo.objective} wait-time budget fast (1h and 5m windows).`,
      },
    });
    rules.push({
      alert: `MatadorWaitSLOSlowBurn${suffix}`,
      expr:
        `(${errorRatio(ns, slo, '6h')} > ${slow})` +
        ` and (${errorRatio(ns, slo, '30m')} > ${slow})`,
      for: '15m',
      labels: { severity: 'warning', slo: 'wait' },
      annotations: {
        summary: `Slow wait-time SLO burn (${where})`,
        description: `Burning the ${slo.objective} wait-time budget (6h and 30m windows).`,
      },
    });
  }
  return { name: `${ns}.slo`, rules };
}
