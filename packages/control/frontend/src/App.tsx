import { useMemo, useState } from 'react';
import { Api } from './api.js';
import { Dashboard } from './Dashboard.js';
import { Eyebrow } from './ui.js';

export function App() {
  const api = useMemo(() => new Api(), []);
  const [token, setToken] = useState('');

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

      <Dashboard api={api} />

      <footer style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
        <Eyebrow>Matador · open source observability + ops for BullMQ</Eyebrow>
      </footer>
    </main>
  );
}
