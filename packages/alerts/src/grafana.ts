export interface GrafanaOptions {
  namespace?: string;
  title?: string;
  /** Prometheus datasource uid placeholder. Default "${DS_PROMETHEUS}". */
  datasource?: string;
}

interface Target {
  expr: string;
  legendFormat: string;
  refId: string;
}

interface Panel {
  title: string;
  type: string;
  gridPos: { h: number; w: number; x: number; y: number };
  targets: Target[];
  fieldConfig?: { defaults: { unit?: string } };
}

function panel(
  title: string,
  x: number,
  y: number,
  targets: { expr: string; legend: string }[],
  unit?: string,
): Panel {
  const p: Panel = {
    title,
    type: 'timeseries',
    gridPos: { h: 8, w: 12, x, y },
    targets: targets.map((t, i) => ({
      expr: t.expr,
      legendFormat: t.legend,
      refId: String.fromCharCode(65 + i),
    })),
  };
  if (unit !== undefined) p.fieldConfig = { defaults: { unit } };
  return p;
}

/** Generate a Grafana dashboard JSON for the Matador metrics, with a queue variable. */
export function generateDashboard(opts: GrafanaOptions = {}): Record<string, unknown> {
  const ns = opts.namespace ?? 'matador';
  const ds = opts.datasource ?? '${DS_PROMETHEUS}';
  const q = '{queue=~"$queue"}';
  const qBucket = '{queue=~"$queue"}';

  const panels: Panel[] = [
    panel('Throughput', 0, 0, [
      { expr: `sum by (queue) (rate(${ns}_jobs_completed_total${q}[5m]))`, legend: '{{queue}} completed/s' },
      { expr: `sum by (queue) (rate(${ns}_jobs_failed_total${q}[5m]))`, legend: '{{queue}} failed/s' },
    ]),
    panel(
      'Processing p95',
      12,
      0,
      [
        {
          expr: `histogram_quantile(0.95, sum by (le, queue) (rate(${ns}_job_processing_seconds_bucket${qBucket}[5m])))`,
          legend: '{{queue}}',
        },
      ],
      's',
    ),
    panel(
      'Wait-time p95',
      0,
      8,
      [
        {
          expr: `histogram_quantile(0.95, sum by (le, queue) (rate(${ns}_job_wait_seconds_bucket${qBucket}[5m])))`,
          legend: '{{queue}}',
        },
      ],
      's',
    ),
    panel('Backlog', 12, 8, [
      {
        expr: `${ns}_queue_depth{state="waiting",queue=~"$queue"} + ${ns}_queue_depth{state="delayed",queue=~"$queue"}`,
        legend: '{{queue}}',
      },
    ]),
    panel('Failure rate', 0, 16, [
      {
        expr:
          `sum by (queue) (rate(${ns}_jobs_failed_total${q}[5m]))` +
          ` / (sum by (queue) (rate(${ns}_jobs_completed_total${q}[5m]))` +
          ` + sum by (queue) (rate(${ns}_jobs_failed_total${q}[5m])))`,
        legend: '{{queue}}',
      },
    ], 'percentunit'),
    panel('Dead letter size', 12, 16, [
      { expr: `${ns}_queue_depth{state="failed",queue=~"$queue"}`, legend: '{{queue}}' },
    ]),
  ];

  return {
    title: opts.title ?? 'Matador · BullMQ',
    schemaVersion: 39,
    editable: true,
    refresh: '30s',
    time: { from: 'now-6h', to: 'now' },
    templating: {
      list: [
        {
          name: 'queue',
          type: 'query',
          datasource: ds,
          query: `label_values(${ns}_queue_depth, queue)`,
          includeAll: true,
          multi: true,
          current: { text: 'All', value: '$__all' },
        },
      ],
    },
    panels: panels.map((p, i) => ({ ...p, id: i + 1, datasource: ds })),
  };
}
