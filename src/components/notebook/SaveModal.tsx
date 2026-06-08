// Progress modal for the full-screen editor save (push → sync → done/error).
// Pure presentation driven by the `saveModal` state the data hook owns.

import React from 'react';
import type { SaveModalStep } from '@site/src/types';
import { s } from './styles';

interface Props {
  step: SaveModalStep;
  progress: number;
  error: string | null;
  onClose: () => void;
}

const INFO: Record<string, { label: string; color: string }> = {
  pushing: { label: 'Pushing to GitHub…', color: 'var(--ifm-color-primary)' },
  syncing: { label: 'Verifying in repository…', color: 'var(--ifm-color-primary)' },
  done: { label: '✓ Saved successfully!', color: '#38a169' },
  error: { label: '✕ Save failed', color: '#e53e3e' },
};

export default function SaveModal({ step, progress, error, onClose }: Props) {
  const { label, color } = INFO[step] ?? INFO.pushing;
  return (
    <div style={s.modalOverlay}>
      <div style={s.modalCard}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14, color }}>{label}</div>
        <div style={s.modalProgressTrack}>
          <div
            style={{
              height: '100%',
              borderRadius: 3,
              width: `${progress}%`,
              backgroundColor: color,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
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
