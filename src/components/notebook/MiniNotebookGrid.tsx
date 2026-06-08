// A compact, dockable "clippings" panel — the Google-Notebook-style mini grid.
// It floats bottom-right of the workspace and shows a dense, scrollable feed of
// the current notebook's notes as draggable clip tiles, so you can scan and
// cross-reference recent fragments without leaving the main reading column.
//
// Purely presentational: it reads notes the data hook already loaded and calls
// back to open one. Drag is an affordance (HTML5 draggable) for moving a clip;
// the click is the primary action.

import React, { useState } from 'react';
import { formatTimestamp, noteUpdatedAt } from '@site/src/lib/notes';
import type { NoteFile, NotebookMetadataState } from '@site/src/types';

interface Props {
  notebookName: string;
  notes: NoteFile[];
  metadata: NotebookMetadataState;
  onOpenNote: (note: NoteFile) => void;
}

export default function MiniNotebookGrid({ notebookName, notes, metadata, onOpenNote }: Props) {
  const [open, setOpen] = useState(false);

  // Most-recently-updated first — the "recent clips" feed.
  const clips = [...notes].sort(
    (a, b) => (noteUpdatedAt(b.name, metadata?.updated) ?? 0) - (noteUpdatedAt(a.name, metadata?.updated) ?? 0),
  );

  if (!open) {
    return (
      <button style={toggle} onClick={() => setOpen(true)} title="Open the clips grid">
        ▤ Clips{notes.length ? ` · ${notes.length}` : ''}
      </button>
    );
  }

  return (
    <aside style={panel} aria-label="Recent clips">
      <header style={head}>
        <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Clips · {notebookName}
        </span>
        <button style={closeBtn} onClick={() => setOpen(false)} title="Dock away" aria-label="Close clips grid">
          ✕
        </button>
      </header>
      <div style={feed}>
        {clips.length === 0 && <div style={empty}>No clips in this notebook yet.</div>}
        {clips.map((note) => {
          const title = metadata?.titles?.[note.name] || note.name.replace(/\.mdx?$/, '');
          const updated = noteUpdatedAt(note.name, metadata?.updated);
          return (
            <div
              key={note.name}
              style={tile}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                try {
                  e.dataTransfer.setData('text/plain', note.name);
                } catch {
                  /* ignore */
                }
              }}
              onClick={() => onOpenNote(note)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenNote(note);
                }
              }}
              title={title}
            >
              <span style={tileTitle}>{title}</span>
              {updated && <span style={tileMeta}>{formatTimestamp(updated)}</span>}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

const toggle: React.CSSProperties = {
  position: 'fixed',
  bottom: 60,
  right: 16,
  zIndex: 95,
  height: 32,
  padding: '0 14px',
  borderRadius: 16,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  color: '#fff',
  background: 'var(--ifm-color-primary)',
  border: 'none',
  boxShadow: '0 4px 16px rgba(26,86,219,0.35)',
};

const panel: React.CSSProperties = {
  position: 'fixed',
  bottom: 60,
  right: 16,
  zIndex: 95,
  width: 'min(360px, 92vw)',
  maxHeight: '62vh',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 12,
  overflow: 'hidden',
  background: 'var(--ifm-background-surface-color)',
  border: '1px solid var(--ifm-color-emphasis-300)',
  boxShadow: '0 18px 48px rgba(17,24,39,0.22)',
};

const head: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '1px solid var(--ifm-color-emphasis-200)',
  color: 'var(--ifm-color-emphasis-700)',
  flexShrink: 0,
};

const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--ifm-color-emphasis-500)',
  padding: 2,
  lineHeight: 1,
};

const feed: React.CSSProperties = {
  overflowY: 'auto',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const tile: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 10px',
  borderRadius: 7,
  border: '1px solid var(--ifm-color-emphasis-200)',
  background: 'var(--ifm-background-color)',
  cursor: 'grab',
  fontSize: 13,
};

const tileTitle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 500,
  minWidth: 0,
};

const tileMeta: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 10.5,
  color: 'var(--ifm-color-emphasis-500)',
  fontVariantNumeric: 'tabular-nums',
};

const empty: React.CSSProperties = {
  padding: '16px 10px',
  fontSize: 12,
  color: 'var(--ifm-color-emphasis-500)',
  textAlign: 'center',
};
