// GitHub personal-access-token capture + validation. Verification goes through
// the service (a throwaway client for the entered token) so this component
// holds no fetch logic of its own.

import React, { useState } from 'react';
import { createGitHubClient } from '@site/src/services/github';
import { s } from './styles';

interface Props {
  onAuthenticated: (token: string) => void;
  onDismiss?: () => void;
}

export default function TokenGate({ onAuthenticated, onDismiss }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    const token = value.trim();
    if (!token) return;
    setTesting(true);
    setError('');
    try {
      const ok = await createGitHubClient(token).verify();
      if (ok) {
        localStorage.setItem('gh_pat', token);
        onAuthenticated(token);
      } else {
        setError('Token rejected by GitHub. Check that it has repo scope.');
      }
    } catch {
      setError('Network error. Check your connection.');
    }
    setTesting(false);
  };

  return (
    <div style={s.gate}>
      <div style={s.gateCard}>
        {onDismiss && (
          <button onClick={onDismiss} style={s.gateClose} title="Dismiss">
            ✕
          </button>
        )}
        <h2 style={{ margin: '0 0 8px' }}>Connect to GitHub</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--ifm-color-emphasis-600)', fontSize: 14 }}>
          Paste your GitHub Personal Access Token (with <code>repo</code> scope) to start writing
          notes. It will be saved in your browser only.
        </p>
        <input
          type="password"
          placeholder="ghp_xxxxxxxxxxxx"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={s.input}
          autoFocus
        />
        {error && <p style={{ color: '#e53e3e', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
        <button
          onClick={handleSave}
          disabled={testing || !value.trim()}
          style={{ ...s.btn, ...s.btnPrimary, width: '100%' }}
        >
          {testing ? 'Verifying…' : 'Save Token & Continue'}
        </button>
        <p
          style={{
            margin: '16px 0 0',
            fontSize: 12,
            color: 'var(--ifm-color-emphasis-500)',
            textAlign: 'center',
          }}
        >
          Token stays on this device. Never written to source code.
        </p>
      </div>
    </div>
  );
}
