import type { MatadorConfig, PartialConfig } from './types.js';

const DEFAULTS: MatadorConfig = {
  labelJobName: false,
  durationBucketsSeconds: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 300],
  waitTimeLruSize: 10_000,
  scrapeCacheTtlMs: 5_000,
};

function envBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === 'true' || v === '1';
}

function envInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The one and only place that reads the environment (invariant I7).
 * Precedence: kwargs > env > defaults.
 */
export function resolveConfig(kwargs: PartialConfig = {}): MatadorConfig {
  const fromEnv: PartialConfig = {};
  const envLabel = envBool(process.env.MATADOR_LABEL_JOB_NAME);
  if (envLabel !== undefined) fromEnv.labelJobName = envLabel;
  const envTtl = envInt(process.env.MATADOR_SCRAPE_CACHE_TTL_MS);
  if (envTtl !== undefined) fromEnv.scrapeCacheTtlMs = envTtl;

  return { ...DEFAULTS, ...fromEnv, ...kwargs };
}
