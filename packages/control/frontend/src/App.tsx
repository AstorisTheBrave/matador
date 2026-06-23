export function App() {
  return (
    <main style={{ minHeight: '100vh', padding: '2rem' }}>
      <div className="matador-glass" style={{ maxWidth: 520, padding: '1.5rem' }}>
        <p
          className="matador-mono"
          style={{ textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.7 }}
        >
          Matador · control
        </p>
        <h1 style={{ margin: '0.5rem 0 0.25rem' }}>Queues</h1>
        <p style={{ opacity: 0.8 }}>The control plane dashboard.</p>
      </div>
    </main>
  );
}
