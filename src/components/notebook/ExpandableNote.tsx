// A Jupyter-style note tile: collapsed it shows title + timestamp; expanded it
// lazy-loads the body and offers inline edit/preview/save. Save state is driven
// by the shared lifecycle reducer (idle → saving → committed/error).

import React, { useEffect, useState } from 'react';
import { formatTimestamp } from '@site/src/lib/notes';
import { useSaveLifecycle } from '@site/src/hooks/useSaveLifecycle';
import type { NoteContent, NoteFile } from '@site/src/types';
import MarkdownPreview from './MarkdownPreview';
import { s } from './styles';

interface Props {
  note: NoteFile;
  title: string;
  updatedAt: number | null;
  expanded: boolean;
  onToggle: (name: string) => void;
  onLoad: (note: NoteFile) => Promise<NoteContent>;
  onSave: (note: NoteFile, title: string, content: string, sha: string | null) => Promise<string | null>;
  deleteSlot: React.ReactNode;
  index: number;
  onDragStart: (e: React.DragEvent, name: string) => void;
  onHover: (index: number) => void;
  onDropAt: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  dragActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ExpandableNote({
  note,
  title,
  updatedAt,
  expanded,
  onToggle,
  onLoad,
  onSave,
  deleteSlot,
  index,
  onDragStart,
  onHover,
  onDropAt,
  onDragEnd,
  dragging,
  dragActive,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState('');
  const [baseContent, setBaseContent] = useState('');
  const [sha, setSha] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState(title);
  const [baseTitle, setBaseTitle] = useState(title);
  const [renderMode, setRenderMode] = useState(true);
  const save = useSaveLifecycle();

  // Keep the title field in sync with metadata when the user hasn't edited it.
  useEffect(() => {
    setEditTitle((prev) => (prev === baseTitle ? title : prev));
    setBaseTitle(title);
  }, [title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load the note body the first time the tile is expanded.
  useEffect(() => {
    if (!expanded || loaded || loading) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    onLoad(note)
      .then(({ content: body, sha: fileSha }) => {
        if (cancelled) return;
        setContent(body);
        setBaseContent(body);
        setSha(fileSha);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load note.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = content !== baseContent || editTitle !== baseTitle;

  const handleSave = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    save.begin();
    try {
      const newSha = await onSave(note, editTitle, content, sha);
      setSha(newSha);
      setBaseContent(content);
      setBaseTitle(editTitle);
      save.succeed();
    } catch (err: unknown) {
      save.fail(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  return (
    <div
      style={{
        ...s.noteItem,
        ...(expanded ? s.noteItemExpanded : {}),
        ...(dragging ? s.noteItemDragging : {}),
      }}
      className="note-item-row"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDragOver={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const after = e.clientY - rect.top > rect.height / 2;
        onHover(after ? index + 1 : index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropAt();
      }}
    >
      <div style={s.tileHeader} onClick={() => onToggle(note.name)}>
        <span
          style={s.dragHandle}
          className="note-drag-handle"
          title="Drag to reorder"
          draggable
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => onDragStart(e, note.name)}
          onDragEnd={onDragEnd}
        >
          ⠿
        </span>
        <span style={{ ...s.tileChevron, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▸
        </span>
        <span style={s.noteIcon}>📄</span>
        <span style={{ flex: 1, fontWeight: expanded ? 600 : 400 }}>
          {title || note.name.replace(/\.mdx?$/, '')}
        </span>
        {updatedAt && (
          <span style={s.tileUpdated} title={`Last updated ${formatTimestamp(updatedAt)}`}>
            {formatTimestamp(updatedAt)}
          </span>
        )}
        {isDirty && (
          <span style={s.unsavedBadge}>
            <span style={s.unsavedDot} />
            unsaved
          </span>
        )}
        {deleteSlot}
      </div>

      {expanded && (
        <div style={s.tileBody} onClick={(e) => e.stopPropagation()}>
          {loading && <div style={s.hint}>Loading note…</div>}
          {loadError && <div style={{ ...s.hint, color: '#e53e3e' }}>{loadError}</div>}
          {loaded && (
            <>
              <div style={s.tileToolbar}>
                <div style={s.segmented}>
                  <button
                    onClick={() => setRenderMode(false)}
                    style={{ ...s.segment, ...(!renderMode ? s.segmentActive : {}) }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={() => setRenderMode(true)}
                    style={{ ...s.segment, ...(renderMode ? s.segmentActive : {}) }}
                  >
                    👁 Preview
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {save.error && <span style={{ fontSize: 12, color: '#e53e3e' }}>{save.error}</span>}
                  <button
                    onClick={handleSave}
                    disabled={save.saving || !isDirty}
                    style={{ ...s.btn, ...(isDirty ? s.btnPrimary : s.btnSaved) }}
                  >
                    {save.saving ? 'Saving…' : save.justSaved ? '✓ Saved' : isDirty ? 'Save' : '✓ Saved'}
                  </button>
                </div>
              </div>
              {renderMode ? (
                <MarkdownPreview title={editTitle} content={content} wrapperStyle={s.tilePreview} />
              ) : (
                <>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Note title"
                    style={{ ...s.input, ...s.titleInput }}
                  />
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your note in Markdown…"
                    style={{ ...s.textarea, ...s.tileTextarea }}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(ExpandableNote);
