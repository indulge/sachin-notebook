import React, { useState } from 'react';
import { s } from './styles';

interface Props {
  onCreate: (name: string) => void;
  onCancel: () => void;
  saving: boolean;
  status?: string;
}

export default function NewNotebookPanel({ onCreate, onCancel, saving, status }: Props) {
  const [name, setName] = useState('');
  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <button onClick={onCancel} style={{ ...s.btn, ...s.btnGhost }}>
          ← Back
        </button>
      </div>
      <div style={s.editorBody}>
        <h3 style={{ margin: '0 0 16px' }}>Create New Notebook</h3>
        <label style={s.label}>Notebook name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreate(name)}
          placeholder="e.g. Machine Learning"
          style={{ ...s.input, marginBottom: 20 }}
          autoFocus
        />
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--ifm-color-emphasis-600)' }}>
          Notebooks group related notes together.
        </p>
        {status && <p style={s.statusText}>{status}</p>}
        <button
          onClick={() => onCreate(name)}
          disabled={saving || !name.trim()}
          style={{ ...s.btn, ...s.btnPrimary }}
        >
          {saving ? 'Creating…' : 'Create Notebook'}
        </button>
      </div>
    </div>
  );
}
