import { useState } from 'react';
import type { Api } from './api.js';
import { usePolling } from './useSnapshot.js';
import type { QueueDetail, QueuesPage } from './types.js';
import { STATE_ORDER } from './types.js';
import { Button, Eyebrow, Mono, StatePill } from './ui.js';
import { JobsPanel, WorkersPanel, DlqPanel } from './panels.js';

type Tab = 'overview' | 'jobs' | 'workers' | 'dlq';
const TABS: Tab[] = ['overview', 'jobs', 'workers', 'dlq'];

function backlog(c: QueueDetail['counts']): number {
  return c.waiting + c.delayed + c.prioritized;
}

export function Dashboard({ api }: { api: Api }) {
  const [selected, setSelected] = useState<string | undefined>();
  const queues = usePolling<QueuesPage>(() => api.listQueues(), 3000, 'queues');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 'var(--space-4)' }}>
      <section className="matador-glass" style={{ padding: 'var(--space-4)', alignSelf: 'start' }}>
        <Eyebrow>Queues</Eyebrow>
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queues.error ? (
            <p style={{ color: 'var(--status-error)', fontSize: 'var(--text-caption)' }}>{queues.error}</p>
          ) : !queues.data || queues.data.items.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)' }}>
              {queues.loading ? 'Loading.' : 'No queues found.'}
            </p>
          ) : (
            queues.data.items.map((q) => {
              const active = q.name === selected;
              return (
                <button
                  key={q.name}
                  onClick={() => setSelected(q.name)}
                  style={{
                    font: 'inherit',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: 'var(--border-hairline) solid transparent',
                    background: active ? 'var(--surface-overlay)' : 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.name}
                  </span>
                  <Mono style={{ color: q.counts.failed > 0 ? 'var(--status-error)' : 'var(--text-tertiary)' }}>
                    {q.stuck ? 'stuck · ' : ''}
                    {backlog(q.counts).toLocaleString()}
                    {q.counts.paused > 0 ? ' · paused' : ''}
                  </Mono>
                </button>
              );
            })
          )}
        </div>
      </section>

      {selected ? (
        <QueueDetailView api={api} name={selected} onChanged={() => void queues.refresh()} />
      ) : (
        <section className="matador-glass" style={{ padding: 'var(--space-6)', alignSelf: 'start' }}>
          <p style={{ color: 'var(--text-tertiary)' }}>Select a queue to see its detail and actions.</p>
        </section>
      )}
    </div>
  );
}

function QueueDetailView({
  api,
  name,
  onChanged,
}: {
  api: Api;
  name: string;
  onChanged: () => void;
}) {
  const detail = usePolling<QueueDetail>(() => api.getQueue(name), 3000, name);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState<string>();
  const [confirmDrain, setConfirmDrain] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [note, setNote] = useState<string>();

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setNote(undefined);
    try {
      await fn();
      await detail.refresh();
      onChanged();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'action failed');
    } finally {
      setBusy(undefined);
    }
  };

  const c = detail.data?.counts;
  const paused = (c?.paused ?? 0) > 0;

  return (
    <section className="matador-glass" style={{ padding: 'var(--space-5)', alignSelf: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <Eyebrow>Queue</Eyebrow>
          <h2 style={{ margin: '4px 0 0', fontSize: 'var(--text-title)' }}>{name}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {paused ? (
            <Button variant="primary" disabled={busy !== undefined} onClick={() => void act('resume', () => api.resume(name))}>
              {busy === 'resume' ? 'Resuming.' : 'Resume'}
            </Button>
          ) : (
            <Button disabled={busy !== undefined} onClick={() => void act('pause', () => api.pause(name))}>
              {busy === 'pause' ? 'Pausing.' : 'Pause'}
            </Button>
          )}
          <Button
            disabled={busy !== undefined || (c?.failed ?? 0) === 0}
            onClick={() => void act('retry', () => api.retryFailed(name))}
          >
            {busy === 'retry' ? 'Retrying.' : 'Retry failed'}
          </Button>
          <Button
            variant="danger"
            disabled={busy !== undefined || (c?.failed ?? 0) === 0}
            onClick={() => setConfirmDrain(true)}
          >
            Drain DLQ
          </Button>
        </div>
      </div>

      {note ? (
        <p style={{ color: 'var(--status-error)', fontSize: 'var(--text-caption)', marginTop: 8 }}>{note}</p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'var(--space-4)' }}>
        {c
          ? STATE_ORDER.map((s) => <StatePill key={s} label={s} value={c[s]} />)
          : detail.error
            ? <p style={{ color: 'var(--status-error)' }}>{detail.error}</p>
            : <p style={{ color: 'var(--text-tertiary)' }}>Loading.</p>}
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-4)' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                font: 'inherit',
                fontSize: 'var(--text-label)',
                padding: '4px 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                borderBottom: `2px solid ${t === tab ? 'var(--accent-primary)' : 'transparent'}`,
                background: 'transparent',
                color: t === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {t === 'dlq' ? 'dead letter' : t}
            </button>
          ))}
        </div>
        {tab === 'overview' ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-caption)' }}>
            Use the tabs to inspect jobs, see attached workers, and analyze the dead-letter queue.
          </p>
        ) : tab === 'jobs' ? (
          <JobsPanel api={api} queue={name} />
        ) : tab === 'workers' ? (
          <WorkersPanel api={api} queue={name} />
        ) : (
          <DlqPanel api={api} queue={name} />
        )}
      </div>

      {confirmDrain ? (
        <ConfirmDrain
          name={name}
          value={confirmText}
          onChange={setConfirmText}
          busy={busy === 'drain'}
          onCancel={() => {
            setConfirmDrain(false);
            setConfirmText('');
          }}
          onConfirm={() =>
            void act('drain', () => api.drainDlq(name, confirmText)).then(() => {
              setConfirmDrain(false);
              setConfirmText('');
            })
          }
        />
      ) : null}
    </section>
  );
}

function ConfirmDrain(props: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const matches = props.value === props.name;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10,
      }}
    >
      <div className="matador-glass" style={{ padding: 'var(--space-5)', maxWidth: 420, margin: 'var(--space-4)' }}>
        <Eyebrow>Confirm drain</Eyebrow>
        <p style={{ margin: '10px 0', color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
          This removes the failed jobs in <strong>{props.name}</strong>. Type the queue name to confirm.
        </p>
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.name}
          autoFocus
          style={{
            width: '100%',
            font: 'inherit',
            padding: '8px 10px',
            borderRadius: 'var(--radius-md)',
            border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.16))',
            background: 'var(--surface-bg)',
            color: 'var(--text-primary)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--space-4)' }}>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="danger" disabled={!matches || props.busy} onClick={props.onConfirm}>
            {props.busy ? 'Draining.' : 'Drain DLQ'}
          </Button>
        </div>
      </div>
    </div>
  );
}
