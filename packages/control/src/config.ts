import { readFileSync } from 'node:fs';
import type { MonitorConfig } from './monitors.js';

export interface ControlConfig {
  host: string;
  port: number;
  /** Token for read-only views. */
  viewerToken: string | undefined;
  /** Token for operational actions (pause/resume/retry/drain). */
  opsToken: string | undefined;
  /** Token for admin actions (manage connections). admin >= ops >= viewer. */
  adminToken: string | undefined;
  redisUrl: string;
  /** Extra named Redis connections beyond the default, selectable with ?connection=. */
  connections: { id: string; redisUrl: string }[];
  /** Optional allowlist; when set, only these queues are discoverable. */
  queueAllowlist: string[] | undefined;
  statePath: string;
  /** Max request body size in bytes. */
  maxBodyBytes: number;
  slackWebhook: string | undefined;
  pagerDutyKey: string | undefined;
  webhookUrl: string | undefined;
  monitorIntervalMs: number;
  monitors: MonitorConfig;
}

export type PartialControlConfig = Partial<ControlConfig>;

const DEFAULTS: ControlConfig = {
  host: '127.0.0.1',
  port: 4319,
  viewerToken: undefined,
  opsToken: undefined,
  adminToken: undefined,
  redisUrl: 'redis://127.0.0.1:6379',
  connections: [],
  queueAllowlist: undefined,
  statePath: './matador-control-state.json',
  maxBodyBytes: 64 * 1024,
  slackWebhook: undefined,
  pagerDutyKey: undefined,
  webhookUrl: undefined,
  monitorIntervalMs: 30_000,
  monitors: {},
};

function envBool(v: string | undefined): boolean {
  return v === 'true' || v === '1';
}

/** Read a token directly or from a *_TOKEN_FILE path. Never logged. */
function readSecret(value: string | undefined, file: string | undefined): string | undefined {
  if (value !== undefined && value !== '') return value;
  if (file !== undefined && file !== '') return readFileSync(file, 'utf8').trim();
  return undefined;
}

function envInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The one place that reads the environment (invariant I7). Precedence is
 * kwargs > env > defaults. Tokens may come from *_TOKEN_FILE.
 */
export function resolveControlConfig(kwargs: PartialControlConfig = {}): ControlConfig {
  const env = process.env;
  const fromEnv: PartialControlConfig = {};

  if (env.MATADOR_CONTROL_HOST) fromEnv.host = env.MATADOR_CONTROL_HOST;
  const port = envInt(env.MATADOR_CONTROL_PORT);
  if (port !== undefined) fromEnv.port = port;
  if (env.MATADOR_CONTROL_REDIS_URL) fromEnv.redisUrl = env.MATADOR_CONTROL_REDIS_URL;
  if (env.MATADOR_CONTROL_STATE_PATH) fromEnv.statePath = env.MATADOR_CONTROL_STATE_PATH;
  if (env.MATADOR_CONTROL_QUEUE_ALLOWLIST) {
    fromEnv.queueAllowlist = env.MATADOR_CONTROL_QUEUE_ALLOWLIST.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const viewer = readSecret(env.MATADOR_CONTROL_VIEWER_TOKEN, env.MATADOR_CONTROL_VIEWER_TOKEN_FILE);
  if (viewer !== undefined) fromEnv.viewerToken = viewer;
  const ops = readSecret(env.MATADOR_CONTROL_OPS_TOKEN, env.MATADOR_CONTROL_OPS_TOKEN_FILE);
  if (ops !== undefined) fromEnv.opsToken = ops;
  const admin = readSecret(env.MATADOR_CONTROL_ADMIN_TOKEN, env.MATADOR_CONTROL_ADMIN_TOKEN_FILE);
  if (admin !== undefined) fromEnv.adminToken = admin;
  if (env.MATADOR_CONTROL_CONNECTIONS) {
    const conns = env.MATADOR_CONTROL_CONNECTIONS.split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const eq = pair.indexOf('=');
        return { id: pair.slice(0, eq).trim(), redisUrl: pair.slice(eq + 1).trim() };
      })
      .filter((c) => c.id !== '' && c.redisUrl !== '');
    if (conns.length > 0) fromEnv.connections = conns;
  }
  const maxBody = envInt(env.MATADOR_CONTROL_MAX_BODY_BYTES);
  if (maxBody !== undefined) fromEnv.maxBodyBytes = maxBody;

  const slack = readSecret(env.MATADOR_CONTROL_SLACK_WEBHOOK, env.MATADOR_CONTROL_SLACK_WEBHOOK_FILE);
  if (slack !== undefined) fromEnv.slackWebhook = slack;
  const pd = readSecret(env.MATADOR_CONTROL_PAGERDUTY_KEY, env.MATADOR_CONTROL_PAGERDUTY_KEY_FILE);
  if (pd !== undefined) fromEnv.pagerDutyKey = pd;
  if (env.MATADOR_CONTROL_WEBHOOK_URL) fromEnv.webhookUrl = env.MATADOR_CONTROL_WEBHOOK_URL;
  const interval = envInt(env.MATADOR_CONTROL_MONITOR_INTERVAL_MS);
  if (interval !== undefined) fromEnv.monitorIntervalMs = interval;

  const monitors: MonitorConfig = {};
  const backlog = envInt(env.MATADOR_CONTROL_MONITOR_BACKLOG);
  if (backlog !== undefined) monitors.backlogThreshold = backlog;
  const failed = envInt(env.MATADOR_CONTROL_MONITOR_FAILED);
  if (failed !== undefined) monitors.failedThreshold = failed;
  const maxMem = envInt(env.MATADOR_CONTROL_MONITOR_MAX_MEMORY);
  if (maxMem !== undefined) monitors.maxMemoryBytes = maxMem;
  if (envBool(env.MATADOR_CONTROL_MONITOR_MISSING_WORKERS)) monitors.missingWorkers = true;
  if (envBool(env.MATADOR_CONTROL_MONITOR_SLOW_JOBS)) monitors.slowJobs = true;
  if (envBool(env.MATADOR_CONTROL_MONITOR_CONNECTION)) monitors.connection = true;
  if (Object.keys(monitors).length > 0) fromEnv.monitors = monitors;

  return { ...DEFAULTS, ...fromEnv, ...kwargs };
}
