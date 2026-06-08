// Last-resort error boundary around the notebook workspace. A render-time
// throw (a malformed note, an unexpected API shape) is caught here and turned
// into a recoverable message instead of a blank white screen. Async/network
// failures are handled closer to the call site (try/catch + notifications);
// this catches the synchronous-render class of bug.

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Optional label for the surface being guarded, shown in the fallback. */
  label?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface in the console for diagnosis; the UI shows a recovery affordance.
    console.error('Notebook crashed:', error, info.componentStack);
  }

  handleReset = (): void => this.setState({ error: null });

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.emoji}>💥</div>
          <h2 style={{ margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={styles.detail}>
            {this.props.label ? `${this.props.label} ` : ''}hit an unexpected error.
          </p>
          <pre style={styles.msg}>{error.message}</pre>
          <div style={styles.actions}>
            <button style={{ ...styles.btn, ...styles.primary }} onClick={this.handleReset}>
              Try again
            </button>
            <button
              style={{ ...styles.btn, ...styles.ghost }}
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: 24,
  },
  card: {
    maxWidth: 460,
    textAlign: 'center',
    padding: 32,
    border: '1px solid var(--ifm-color-emphasis-300)',
    borderRadius: 12,
    background: 'var(--ifm-background-surface-color)',
  },
  emoji: { fontSize: 40, marginBottom: 8 },
  detail: { color: 'var(--ifm-color-emphasis-600)', margin: '0 0 16px', fontSize: 14 },
  msg: {
    textAlign: 'left',
    fontSize: 12,
    padding: 12,
    borderRadius: 6,
    background: 'var(--ifm-color-emphasis-100)',
    overflowX: 'auto',
    margin: '0 0 20px',
  },
  actions: { display: 'flex', gap: 8, justifyContent: 'center' },
  btn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  primary: {
    background: 'var(--ifm-color-primary)',
    color: '#fff',
    borderColor: 'var(--ifm-color-primary)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ifm-color-emphasis-700)',
    borderColor: 'var(--ifm-color-emphasis-300)',
  },
};
