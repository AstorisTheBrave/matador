export interface Alert {
  ts: string;
  monitor: string;
  severity: 'warning' | 'critical';
  queue: string | undefined;
  message: string;
  resolved: boolean;
}

export interface Notifier {
  notify(alert: Alert): Promise<void>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

const ALLOWED = new Set(['http:', 'https:']);

/** Validate a notifier webhook URL (SSRF guard): http/https only, config-only. */
export function validateWebhookUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Matador notifier URL is not valid: ${url}`);
  }
  if (!ALLOWED.has(u.protocol)) {
    throw new Error(`Matador notifier URL must use http or https: ${url}`);
  }
  return u.toString();
}

const defaultFetch: FetchLike = async (url, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return { ok: res.ok, status: res.status };
  } finally {
    clearTimeout(timer);
  }
};

function label(alert: Alert): string {
  if (alert.resolved) return 'Resolved';
  return alert.severity === 'critical' ? 'Critical' : 'Warning';
}

export class SlackNotifier implements Notifier {
  constructor(
    private readonly url: string,
    private readonly fetchFn: FetchLike = defaultFetch,
  ) {
    validateWebhookUrl(url);
  }
  async notify(alert: Alert): Promise<void> {
    await this.fetchFn(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${label(alert)}: ${alert.message}` }),
    });
  }
}

export class WebhookNotifier implements Notifier {
  constructor(
    private readonly url: string,
    private readonly fetchFn: FetchLike = defaultFetch,
  ) {
    validateWebhookUrl(url);
  }
  async notify(alert: Alert): Promise<void> {
    await this.fetchFn(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
  }
}

export class PagerDutyNotifier implements Notifier {
  constructor(
    private readonly routingKey: string,
    private readonly fetchFn: FetchLike = defaultFetch,
  ) {}
  async notify(alert: Alert): Promise<void> {
    await this.fetchFn('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: this.routingKey,
        event_action: alert.resolved ? 'resolve' : 'trigger',
        dedup_key: `matador-${alert.monitor}-${alert.queue ?? 'fleet'}`,
        payload: {
          summary: alert.message,
          severity: alert.resolved ? 'info' : alert.severity,
          source: 'matador',
        },
      }),
    });
  }
}

/** Notify all sinks; one failing never stops the others. */
export async function notifyAll(notifiers: readonly Notifier[], alert: Alert): Promise<void> {
  await Promise.all(
    notifiers.map(async (n) => {
      try {
        await n.notify(alert);
      } catch {
        /* a failing notifier must not break monitoring */
      }
    }),
  );
}
