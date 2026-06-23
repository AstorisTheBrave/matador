export interface SloConfig {
  /** Restrict to one queue; omit for a fleet-wide SLO. */
  queue?: string;
  /** Wait-time threshold in seconds. Must equal a histogram bucket boundary. */
  waitThresholdSeconds: number;
  /** Objective, e.g. 0.99 for "99% of jobs wait under the threshold". */
  objective: number;
}

export interface AlertsConfig {
  /** Metric prefix. Default "matador". */
  namespace?: string;
  /** Failure-rate alert threshold (0..1). Default 0.1. */
  failureRateThreshold?: number;
  /** Waiting-backlog alert threshold. Default 1000. */
  backlogThreshold?: number;
  /** p95 processing-latency alert threshold in seconds. Default 60. */
  p95ProcessingThresholdSeconds?: number;
  /** SLO burn-rate definitions. */
  slos?: SloConfig[];
}

export interface AlertRule {
  alert: string;
  expr: string;
  for?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface RuleGroup {
  name: string;
  rules: AlertRule[];
}

export interface RuleFile {
  groups: RuleGroup[];
}

import { generateBurnRateRules } from './burnrate.js';

export function generateRules(config: AlertsConfig = {}): RuleFile {
  const ns = config.namespace ?? 'matador';
  const failure = config.failureRateThreshold ?? 0.1;
  const backlog = config.backlogThreshold ?? 1000;
  const p95 = config.p95ProcessingThresholdSeconds ?? 60;

  const core: RuleGroup = {
    name: `${ns}.alerts`,
    rules: [
      {
        alert: 'MatadorHighFailureRate',
        expr:
          `sum by (queue) (rate(${ns}_jobs_failed_total[5m]))` +
          ` / (sum by (queue) (rate(${ns}_jobs_completed_total[5m]))` +
          ` + sum by (queue) (rate(${ns}_jobs_failed_total[5m]))) > ${failure}`,
        for: '5m',
        labels: { severity: 'warning' },
        annotations: {
          summary: 'High failure rate on {{ $labels.queue }}',
          description: 'More than {{ $value | humanizePercentage }} of jobs are failing.',
        },
      },
      {
        alert: 'MatadorLargeBacklog',
        expr: `${ns}_queue_depth{state="waiting"} > ${backlog}`,
        for: '10m',
        labels: { severity: 'warning' },
        annotations: {
          summary: 'Large backlog on {{ $labels.queue }}',
          description: '{{ $value }} jobs are waiting.',
        },
      },
      {
        alert: 'MatadorSlowProcessing',
        expr:
          `histogram_quantile(0.95, sum by (le, queue) ` +
          `(rate(${ns}_job_processing_seconds_bucket[5m]))) > ${p95}`,
        for: '5m',
        labels: { severity: 'warning' },
        annotations: {
          summary: 'Slow processing on {{ $labels.queue }}',
          description: 'p95 processing time exceeds the threshold.',
        },
      },
      {
        alert: 'MatadorQueuePaused',
        expr: `${ns}_queue_depth{state="paused"} > 0`,
        for: '15m',
        labels: { severity: 'info' },
        annotations: {
          summary: 'Queue {{ $labels.queue }} is paused',
          description: 'A queue has been paused for over 15 minutes.',
        },
      },
    ],
  };

  const groups = [core];
  if (config.slos && config.slos.length > 0) {
    groups.push(generateBurnRateRules(config.slos, ns));
  }
  return { groups };
}
