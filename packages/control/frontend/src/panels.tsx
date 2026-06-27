import { useState } from 'react';
import type { Api } from './api.js';
import { usePolling } from './useSnapshot.js';
import type { DlqAnalytics, JobDetail, JobsPage, WorkerInfo } from './types.js';
import { Button, Eyebrow, Mono } from './ui.js';

const JOB_STATES = ['failed', 'waiting', 'active', 'delayed', 'completed'] as const;

export function JobsPanel({ api, queue }: { api: Api; queue: string }) {
  const [state, setState] = useState<string>('failed');
  const [selected, setSelected] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState('');
  const [addData, setAddData] = useState('{}');
  const [busy, setBusy] = useState(false);
  const jobs = usePolling<JobsPage>(() => api.listJobs(queue, state), 4000, `${queue}:${state}`);

  const submitAdd = async () => {
    setBusy(true);
    try {
      await api.addJob(queue, addName || 'job', JSON.parse(addData || '{}'));
      setAdding(false);
      setAddName('');
      setAddData('{}');
      await jobs.refresh();
    } catch {
      /* invalid JSON or error: keep the form open */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-3)', alignItems: 'center' }}>
        <Button onClick={() => setAdding((v) => !v)}>+ Add job</Button>
        {state === 'delayed' ? (
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api.promoteDelayed(queue).finally(() => {
                setBusy(false);
                void jobs.refresh();
              });
            }}
          >
            Promote all delayed
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div style={{ marginBottom: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="job name"
            style={{ font: 'inherit', fontSize: 'var(--text-caption)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.16))', background: 'var(--surface-bg)', color: 'var(--text-primary)' }}
          />
          <textarea
            value={addData}
            onChange={(e) => setAddData(e.target.value)}
            spellCheck={false}
            placeholder="job data (JSON)"
            style={{ minHeight: 80, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', padding: 8, borderRadius: 'var(--radius-sm)', border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.16))', background: 'var(--surface-bg)', color: 'var(--text-primary)' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={() => void submitAdd()}>Add</Button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-3)' }}>
        {JOB_STATES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setState(s);
              setSelected(undefined);
            }}
            style={{
              font: 'inherit',
              fontSize: 'var(--text-caption)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.12))',
              background: s === state ? 'var(--surface-overlay)' : 'transparent',
              color: s === state ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {jobs.error ? (
        <p style={{ color: 'var(--status-error)' }}>{jobs.error}</p>
      ) : !jobs.data || jobs.data.items.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)' }}>No {state} jobs.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-caption)' }}>
          <tbody>
            {jobs.data.items.map((j) => (
              <tr
                key={j.id}
                onClick={() => setSelected(j.id)}
                style={{
                  cursor: 'pointer',
                  borderTop: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.08))',
                  background: selected === j.id ? 'var(--surface-overlay)' : 'transparent',
                }}
              >
                <td style={{ padding: '6px 8px' }}>
                  <Mono>{j.id}</Mono>
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{j.name}</td>
                <td style={{ padding: '6px 8px' }}>
                  <Mono>x{j.attemptsMade}</Mono>
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--text-tertiary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.failedReason ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected ? <JobDetailCard api={api} queue={queue} id={selected} onClose={() => setSelected(undefined)} onChanged={() => void jobs.refresh()} /> : null}
    </div>
  );
}

function JobDetailCard({
  api,
  queue,
  id,
  onClose,
  onChanged,
}: {
  api: Api;
  queue: string;
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const job = usePolling<JobDetail>(() => api.getJob(queue, id), 8000, `${queue}:${id}`);
  const logs = usePolling<{ logs: string[] }>(() => api.jobLogs(queue, id), 8000, `${queue}:${id}:logs`);
  const tree = usePolling(() => api.jobTree(queue, id), 12000, `${queue}:${id}:tree`);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | undefined>();

  const act = async (action: 'retry' | 'remove' | 'promote' | 'discard' | 'clone') => {
    setBusy(true);
    try {
      await api.jobAction(queue, id, action);
      onChanged();
      if (action === 'remove' || action === 'discard') onClose();
      else await job.refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.jobEdit(queue, id, JSON.parse(editing ?? '{}'));
      setEditing(undefined);
      await job.refresh();
    } catch {
      /* invalid JSON: keep the editor open */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.12))', background: 'var(--surface-elevated)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Eyebrow>Job {id}</Eyebrow>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button disabled={busy} onClick={() => void act('retry')}>Retry</Button>
          <Button disabled={busy} onClick={() => void act('promote')}>Promote</Button>
          <Button disabled={busy} onClick={() => void act('clone')}>Clone</Button>
          <Button disabled={busy} onClick={() => setEditing(JSON.stringify(job.data?.data ?? {}, null, 2))}>Edit data</Button>
          <Button disabled={busy} onClick={() => void act('discard')}>Discard</Button>
          <Button variant="danger" disabled={busy} onClick={() => void act('remove')}>Remove</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>

      {editing !== undefined ? (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <textarea
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            spellCheck={false}
            style={{ width: '100%', minHeight: 120, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', padding: 8, borderRadius: 'var(--radius-sm)', border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.16))', background: 'var(--surface-bg)', color: 'var(--text-primary)' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditing(undefined)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={() => void saveEdit()}>Save data</Button>
          </div>
        </div>
      ) : null}
      {job.data ? (
        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-caption)' }}>
          <p style={{ color: 'var(--text-tertiary)', margin: '4px 0' }}>state · {job.data.state} · attempts {job.data.attemptsMade}</p>
          {tree.data && (tree.data.parent || tree.data.children.processed + tree.data.children.unprocessed > 0) ? (
            <p style={{ color: 'var(--text-tertiary)', margin: '4px 0' }}>
              flow · {tree.data.parent ? `parent ${tree.data.parent.id} · ` : ''}
              {tree.data.children.processed} processed / {tree.data.children.unprocessed} pending children
            </p>
          ) : null}
          <Field label="data" value={job.data.data} />
          <Field label="opts" value={job.data.opts} />
          {job.data.stacktrace.length > 0 ? <Field label="stacktrace" value={job.data.stacktrace} /> : null}
          {logs.data && logs.data.logs.length > 0 ? <Field label="logs" value={logs.data.logs} /> : null}
        </div>
      ) : (
        <p style={{ color: 'var(--text-tertiary)' }}>Loading.</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ margin: '8px 0' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <pre className="matador-mono" style={{ margin: '2px 0 0', padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-bg)', color: 'var(--text-secondary)', overflow: 'auto', maxHeight: 200, fontSize: 'var(--text-caption)' }}>
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const recent = data.length > 0 ? data : [0];
  const max = Math.max(1, ...recent);
  const w = 360;
  const h = 48;
  const step = recent.length > 1 ? w / (recent.length - 1) : w;
  const points = recent.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: '100%' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

const RANGES: { label: string; minutes: number }[] = [
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
];

export function MetricsPanel({ api, queue }: { api: Api; queue: string }) {
  const [range, setRange] = useState(60);
  const completed = usePolling<{ data: number[]; count: number }>(() => api.metrics(queue, 'completed'), 10000, `${queue}:mc`);
  const failed = usePolling<{ data: number[]; count: number }>(() => api.metrics(queue, 'failed'), 10000, `${queue}:mf`);
  const slice = (d?: number[]) => (d ? d.slice(-range) : []);
  const sum = (d?: number[]) => slice(d).reduce((a, b) => a + b, 0);
  const label = RANGES.find((r) => r.minutes === range)?.label ?? '1h';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {RANGES.map((r) => (
          <button
            key={r.minutes}
            onClick={() => setRange(r.minutes)}
            style={{ font: 'inherit', fontSize: 'var(--text-caption)', padding: '2px 10px', borderRadius: 'var(--radius-full)', border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.12))', background: r.minutes === range ? 'var(--surface-overlay)' : 'transparent', color: r.minutes === range ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div>
        <Eyebrow>Completed · per minute</Eyebrow>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)', margin: '4px 0' }}>
          {sum(completed.data?.data)} in the last {label} · {completed.data?.count ?? 0} total
        </p>
        <Sparkline data={slice(completed.data?.data)} color="var(--status-success)" />
      </div>
      <div>
        <Eyebrow>Failed · per minute</Eyebrow>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)', margin: '4px 0' }}>
          {sum(failed.data?.data)} in the last {label} · {failed.data?.count ?? 0} total
        </p>
        <Sparkline data={slice(failed.data?.data)} color="var(--status-error)" />
      </div>
      {completed.data && completed.data.data.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)' }}>
          Enable BullMQ worker metrics to populate these series.
        </p>
      ) : null}
    </div>
  );
}

export function WorkersPanel({ api, queue }: { api: Api; queue: string }) {
  const workers = usePolling<{ workers: WorkerInfo[] }>(() => api.workers(queue), 5000, `${queue}:workers`);
  if (workers.error) return <p style={{ color: 'var(--status-error)' }}>{workers.error}</p>;
  if (!workers.data || workers.data.workers.length === 0)
    return <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)' }}>No workers attached.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-caption)' }}>
      <thead>
        <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
          <th style={{ padding: '4px 8px', fontWeight: 500 }}>name</th>
          <th style={{ padding: '4px 8px', fontWeight: 500 }}>addr</th>
          <th style={{ padding: '4px 8px', fontWeight: 500 }}>idle</th>
        </tr>
      </thead>
      <tbody>
        {workers.data.workers.map((w, i) => (
          <tr key={i} style={{ borderTop: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.08))' }}>
            <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{w.name}</td>
            <td style={{ padding: '6px 8px' }}><Mono>{w.addr ?? '-'}</Mono></td>
            <td style={{ padding: '6px 8px' }}><Mono>{w.idle ?? '-'}</Mono></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DlqPanel({ api, queue }: { api: Api; queue: string }) {
  const a = usePolling<DlqAnalytics>(() => api.dlqAnalytics(queue), 6000, `${queue}:dlq`);
  if (a.error) return <p style={{ color: 'var(--status-error)' }}>{a.error}</p>;
  if (!a.data) return <p style={{ color: 'var(--text-tertiary)' }}>Loading.</p>;
  return (
    <div>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)' }}>
        {a.data.total} failed · {a.data.distinct} distinct reasons
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-caption)', marginTop: 8 }}>
        <tbody>
          {a.data.groups.map((g, i) => (
            <tr key={i} style={{ borderTop: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.08))' }}>
              <td style={{ padding: '6px 8px' }}><Mono>{g.count}</Mono></td>
              <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{g.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
