import { describe, it, expect } from 'vitest';
import { generateDashboard } from '../src/grafana.js';

describe('generateDashboard', () => {
  it('produces a dashboard with a queue variable and the key panels', () => {
    const d = generateDashboard();
    expect(d.title).toBe('Matador · BullMQ');

    const templating = d.templating as { list: { name: string; query: string }[] };
    expect(templating.list[0]?.name).toBe('queue');
    expect(templating.list[0]?.query).toContain('label_values(matador_queue_depth, queue)');

    const panels = d.panels as { title: string }[];
    const titles = panels.map((p) => p.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Throughput', 'Processing p95', 'Wait-time p95', 'Backlog', 'Failure rate', 'Dead letter size']),
    );
  });

  it('respects a custom namespace', () => {
    const d = generateDashboard({ namespace: 'mq' });
    const panels = d.panels as { targets: { expr: string }[] }[];
    expect(JSON.stringify(panels)).toContain('mq_jobs_completed_total');
  });
});
