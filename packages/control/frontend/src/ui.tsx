import type { CSSProperties, ReactNode } from 'react';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
}) {
  const { variant = 'ghost', disabled, onClick, children, title } = props;
  const bg =
    variant === 'primary'
      ? 'var(--accent-primary)'
      : variant === 'danger'
        ? 'var(--status-error)'
        : 'transparent';
  const color = variant === 'ghost' ? 'var(--text-primary)' : 'var(--accent-primary-contrast)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        font: 'inherit',
        fontSize: 'var(--text-label)',
        padding: '6px 12px',
        borderRadius: 'var(--radius-md)',
        border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.14))',
        background: bg,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

export function Mono({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="matador-mono" style={style}>
      {children}
    </span>
  );
}

/** A tiny uppercase, wide-tracked eyebrow label (Nimble voice). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      className="matador-mono"
      style={{
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        fontSize: 'var(--text-caption)',
        color: 'var(--text-tertiary)',
      }}
    >
      {children}
    </span>
  );
}

const STATE_COLOR: Record<string, string> = {
  waiting: 'var(--text-secondary)',
  active: 'var(--status-info)',
  delayed: 'var(--status-warning)',
  failed: 'var(--status-error)',
  completed: 'var(--status-success)',
  paused: 'var(--text-tertiary)',
};

export function StatePill({ label, value }: { label: string; value: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        border: 'var(--border-hairline) solid var(--glass-border, rgba(255,255,255,0.12))',
        fontSize: 'var(--text-caption)',
        color: 'var(--text-secondary)',
      }}
    >
      <span style={{ color: STATE_COLOR[label] ?? 'var(--text-secondary)' }}>{label}</span>
      <Mono style={{ color: 'var(--text-primary)' }}>{value.toLocaleString()}</Mono>
    </span>
  );
}
