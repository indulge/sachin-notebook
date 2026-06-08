// Progress modal for notebook creation (creating → syncing → done/error).
// Pure presentation driven by the `notebookModal` state the data hook owns.

import React from 'react';
import type { NotebookModalStep } from '@site/src/types';
import { s } from './styles';

interface Props {
  step: NotebookModalStep;
  error: string | null;
  onClose: () => void;
}

const INFO: Record<string, { label: string; color: string }> = {
  creating: { label: 'Creating notebook…', color: 'var(--ifm-color-primary)' },
  syncing: { label: 'Verifying in repository…', color: 'var(--ifm-color-primary)' },
  done: { label: '✓ Notebook created', color: '#38a169' },
  error: { label: '✕ Failed to create', color: '#e53e3e' },
};

export default function NotebookModal({ step, error, onClose }: Props) {
  const { label, color } = INFO[step] ?? INFO.creating;
  return (
    <div style={s.modalOverlay}>
      <div style={s.modalCard}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: step === 'done' ? 0 : 14, color }}>
          {label}
        </div>
        {(step === 'creating' || step === 'syncing') && (
          <div style={s.modalProgressTrack}>
            <div
              style={{
                height: '100%',
                borderRadius: 3,
                width: step === 'syncing' ? '80%' : '40%',
                backgroundColor: color,
                opacity: 0.7,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        )}
        {step === 'error' && (
          <>
            {error && <p style={{ fontSize: 13, color: '#e53e3e', margin: '10px 0 0' }}>{error}</p>}
            <button onClick={onClose} style={{ ...s.btn, ...s.btnGhost, marginTop: 14 }}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
