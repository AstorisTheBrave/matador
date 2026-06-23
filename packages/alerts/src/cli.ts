#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump } from 'js-yaml';
import { generateRules } from './rules.js';
import { generateDashboard } from './grafana.js';

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

async function emit(): Promise<void> {
  const out = arg('--out', './matador-monitoring');
  const namespace = arg('--namespace', 'matador');

  await mkdir(out, { recursive: true });

  const rules = generateRules({ namespace });
  await writeFile(join(out, 'matador-rules.yml'), dump(rules), 'utf8');

  const dashboard = generateDashboard({ namespace });
  await writeFile(join(out, 'matador-dashboard.json'), `${JSON.stringify(dashboard, null, 2)}\n`, 'utf8');

  process.stdout.write(`Wrote matador-rules.yml and matador-dashboard.json to ${out}\n`);
}

emit().catch((err: unknown) => {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
});
