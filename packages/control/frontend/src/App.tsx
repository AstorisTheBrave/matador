import { useMemo, useState } from 'react';
import { Api } from './api.js';
import { Dashboard } from './Dashboard.js';
import { usePolling } from './useSnapshot.js';
import type { Alert } from './types.js';
import { Eyebrow } from './ui.js';

function AlertsBanner({ api }: { api: Api }) {
  const m = usePolling<{ active: Alert[] }>(() => api.monitors(), 5000, 'monitors');
  const active = m.data?.active ?? [];
  if (active.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-4)' }}>
      {active.map((a, i) => (
        <div
          key={i}
          className="matador-glass matador-glass--flat"
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-md)',
            borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--status-error)' : 'var(--status-warning)'}`,
            fontSize: 'var(--text-caption)',
            color: 'var(--text-secondary)',
          }}
        >
          <strong style={{ color: a.severity === 'critical' ? 'var(--status-error)' : 'var(--status-warning)' }}>
            {a.severity}
          </strong>{' '}
          · {a.message}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const api = useMemo(() => new Api(), []);
  const [token, setToken] = useState('');
  const [connection, setConnection] = useState('default');
  const conns = usePolling<{ connections: { id: string }[] }>(() => api.connectionList(), 30000, 'conns');
  const connectionIds = conns.data?.connections.map((c) => c.id) ?? ['default'];

  return (
    <main style={{ minHeight: '100vh', padding: 'var(--space-6)', maxWidth: 1200, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div>
          <Eyebrow>Matador · control</Eyebrow>
          <h1 style={{ margin: '4px 0 0', fontSize: 'var(--text-display)', letterSpacing: '-0.01em' }}>
            Queues
          </h1>
        </div>
        {connectionIds.length > 1 ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-tertiary)' }}>connection</span>
            <select
              value={connection}
              onChange={(e) => {
                api.setConnection(e.target.value);
                setConnection(e.target.value);
              }}
              style={{
                font: 'inherit',
                fontSize: 'var(--text-label)',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.16))',
                background: 'var(--surface-bg)',
                color: 'var(--text-primary)',
              }}
            >
              {connectionIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-tertiary)' }}>token</span>
          <input
            type="password"
            value={token}
            placeholder="optional on loopback"
            onChange={(e) => {
              setToken(e.target.value);
              api.setToken(e.target.value);
            }}
            style={{
              font: 'inherit',
              fontSize: 'var(--text-label)',
              padding: '6px 10px',
              width: 220,
              borderRadius: 'var(--radius-md)',
              border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.16))',
              background: 'var(--surface-bg)',
              color: 'var(--text-primary)',
            }}
          />
        </label>
      </header>

      <AlertsBanner api={api} />
      <Dashboard api={api} key={connection} />

      <footer style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
        <Eyebrow>Matador · open source observability + ops for BullMQ</Eyebrow>
      </footer>
    </main>
  );
}
