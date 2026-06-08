import React from 'react';
import type { Notebook } from '@site/src/types';
import { s } from './styles';

interface Props {
  notebooks: Notebook[];
  selected: Notebook | null;
  onSelect: (nb: Notebook) => void;
  onNewNotebook: () => void;
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

function Sidebar({
  notebooks,
  selected,
  onSelect,
  onNewNotebook,
  loading,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <aside style={s.sidebar}>
      <div style={s.sidebarHeader}>
        <span>My Notebooks</span>
        <button
          onClick={onRefresh}
          disabled={loading || refreshing}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            padding: '0 2px',
            opacity: loading || refreshing ? 0.4 : 0.7,
            lineHeight: 1,
          }}
          title="Refresh all"
        >
          {refreshing ? '⟳' : '↻'}
        </button>
      </div>
      <div style={s.notebookList}>
        {loading && <div style={s.hint}>Loading…</div>}
        {!loading && notebooks.length === 0 && (
          <div style={s.hint}>
            No notebooks yet.
            <br />
            Create one below.
          </div>
        )}
        {notebooks.map((nb) => (
          <button
            key={nb.name}
            onClick={() => onSelect(nb)}
            style={{
              ...s.notebookItem,
              ...(selected?.name === nb.name ? s.notebookItemActive : {}),
            }}
          >
            <span style={s.notebookIcon}>📓</span>
            <span style={s.notebookLabel}>{nb.name}</span>
          </button>
        ))}
      </div>
      <div style={s.sidebarFooter}>
        <button onClick={onNewNotebook} style={{ ...s.btn, ...s.btnOutline, width: '100%' }}>
          + New Notebook
        </button>
      </div>
    </aside>
  );
}

export default React.memo(Sidebar);
