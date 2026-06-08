// Placeholder shown in the main pane when no notebook is selected.

import React from 'react';
import { s } from './styles';

export default function EmptyState() {
  return (
    <div style={{ ...s.panel, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--ifm-color-emphasis-500)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📓</div>
        <p style={{ fontSize: 16, margin: 0 }}>
          Select a notebook from the sidebar,
          <br />
          or create a new one.
        </p>
      </div>
    </div>
  );
}
