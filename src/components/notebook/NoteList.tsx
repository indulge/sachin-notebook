// The notes view for a notebook: ordered, expandable tiles with drag-to-reorder
// and hover-to-insert inline drafts. All interaction state lives in the
// `useNoteListInteractions` reducer; this component renders it and wires the
// drag/hover/drop affordances.

import React from 'react';
import { moveToIndex, noteUpdatedAt, orderNotes } from '@site/src/lib/notes';
import { useNoteListInteractions } from '@site/src/hooks/useNoteListInteractions';
import type { NoteContent, NoteFile, Notebook, NotebookMetadataState } from '@site/src/types';
import ExpandableNote from './ExpandableNote';
import DraftNote from './DraftNote';
import { s } from './styles';

interface Props {
  notebook: Notebook;
  notes: NoteFile[];
  loading: boolean;
  onDeleteNote: (note: NoteFile) => void;
  syncing: boolean;
  syncProgress: number;
  metadata: NotebookMetadataState;
  onLoadNote: (note: NoteFile) => Promise<NoteContent>;
  onSaveNote: (
    note: NoteFile,
    title: string,
    content: string,
    sha: string | null,
  ) => Promise<string | null>;
  onReorder: (order: string[]) => void;
  onCreateNote: (
    preceding: string[],
    following: string[],
    title: string,
    content: string,
  ) => Promise<void>;
}

export default function NoteList({
  notebook,
  notes,
  loading,
  onDeleteNote,
  syncing,
  syncProgress,
  metadata,
  onLoadNote,
  onSaveNote,
  onReorder,
  onCreateNote,
}: Props) {
  const ui = useNoteListInteractions(notebook.name);
  const { dragName, dropIndex, hoverIndex, draftAfter, confirmingDelete, expanded, activeInsert } =
    ui.state;

  const orderedNotes = orderNotes(notes, metadata?.order);
  const { hasDraft, dragActive } = ui;

  const handleDraftSave = async (title: string, content: string) => {
    const displayNames = orderedNotes.map((n) => n.name);
    const at = draftAfter ?? -1;
    const preceding = displayNames.slice(0, at + 1);
    const following = displayNames.slice(at + 1);
    await onCreateNote(preceding, following, title, content);
    ui.closeDraft();
  };

  const handleDragStart = (e: React.DragEvent, name: string) => {
    ui.dragStart(name);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for a drag to start.
    try {
      e.dataTransfer.setData('text/plain', name);
    } catch {
      /* ignore */
    }
  };

  const commitDrop = () => {
    if (dragName != null && dropIndex != null) {
      const currentOrder = orderedNotes.map((n) => n.name);
      const newOrder = moveToIndex(currentOrder, dragName, dropIndex);
      if (newOrder.join('\n') !== currentOrder.join('\n')) onReorder(newOrder);
    }
    ui.dragEnd();
  };

  // The gap between/around tiles. Doubles as (a) the drag drop target showing an
  // insertion line, and (b) the hover zone that reveals a "+ New Note" button to
  // insert a blank note below tile `slot - 1`.
  const renderSeparator = (slot: number) => {
    const belowIndex = slot - 1; // the tile this gap sits below
    const canAdd = belowIndex >= 0 && !hasDraft && dragName == null;
    const isActive = canAdd && activeInsert === slot;
    // Reveal the "+" on hover, or keep it pinned when this gap is the anchor.
    const showAdd = canAdd && (hoverIndex === belowIndex || isActive);
    return (
      <div
        className={`note-insert-track${isActive ? ' note-insert-track--active' : ''}`}
        style={s.dropSeparator}
        onClick={() => {
          // Click the gap (not the "+") to pin/unpin the active insertion point.
          if (canAdd) ui.setActiveInsert(slot);
        }}
        onDragOver={(e) => {
          if (dragName != null) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            ui.setDropIndex(slot);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          commitDrop();
        }}
        onMouseEnter={() => {
          if (canAdd) ui.setHoverIndex(belowIndex);
        }}
        onMouseLeave={() => {
          if (canAdd && hoverIndex === belowIndex) ui.setHoverIndex(null);
        }}
      >
        <div
          className="note-insert-line"
          style={dropIndex === slot ? s.dropSeparatorLineActive : undefined}
        />
        {showAdd && (
          <div className="note-add-affordance" style={s.addAffordance}>
            <button
              className="note-insert-btn"
              style={s.addBtn}
              onClick={(e) => {
                e.stopPropagation();
                ui.startDraft(belowIndex);
              }}
              title="Insert a new note here"
              aria-label="Insert a new note here"
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{notebook.name}</span>
        <button
          onClick={() =>
            ui.startDraft(activeInsert != null ? activeInsert - 1 : orderedNotes.length - 1)
          }
          disabled={hasDraft}
          style={{ ...s.btn, ...s.btnPrimary, ...(hasDraft ? s.btnDisabled : {}) }}
          title={
            activeInsert != null
              ? 'Insert a new note at the pinned insertion point'
              : 'Add a new note at the end'
          }
        >
          + New Note{activeInsert != null ? ' ↳' : ''}
        </button>
      </div>
      <div style={s.syncBarTrack}>
        <div
          style={{
            ...s.syncBarFill,
            width: syncing ? `${syncProgress}%` : '0%',
            opacity: syncing ? 1 : 0,
            transition: syncing ? 'width 0.3s ease' : 'opacity 0.4s ease',
          }}
        />
      </div>
      <div style={s.noteListBody}>
        {loading && <div style={s.hint}>Loading notes…</div>}
        {!loading && orderedNotes.length === 0 && !hasDraft && (
          <div className="note-empty-zone" style={s.emptyZone} onClick={() => ui.startDraft(-1)}>
            <span className="note-empty-prompt" style={s.emptyPrompt}>
              No notes yet
            </span>
            <button className="note-empty-btn" style={s.emptyAddBtn} onClick={() => ui.startDraft(-1)}>
              + Create new Note
            </button>
          </div>
        )}
        {!loading && orderedNotes.length === 0 && hasDraft && (
          <DraftNote onSave={handleDraftSave} onDiscard={ui.closeDraft} />
        )}
        {orderedNotes.map((note, i) => {
          const title = metadata?.titles?.[note.name] || note.name.replace(/\.mdx?$/, '');
          const deleteSlot =
            confirmingDelete === note.name ? (
              <span
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                onClick={(e) => e.stopPropagation()}
              >
                <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Delete?</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    ui.cancelDelete();
                    onDeleteNote(note);
                  }}
                  style={{ ...s.btn, ...s.btnDanger, padding: '3px 8px' }}
                >
                  Yes
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    ui.cancelDelete();
                  }}
                  style={{ ...s.btn, ...s.btnGhost, padding: '3px 8px' }}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ui.confirmDelete(note.name);
                }}
                style={s.deleteBtn}
                className="note-delete-btn"
                title="Delete note"
              >
                🗑
              </button>
            );
          const canHover = !hasDraft && dragName == null;
          return (
            <React.Fragment key={note.name}>
              {renderSeparator(i)}
              <ExpandableNote
                note={note}
                title={title}
                updatedAt={noteUpdatedAt(note.name, metadata?.updated)}
                expanded={expanded.has(note.name)}
                onToggle={ui.toggleExpand}
                onLoad={onLoadNote}
                onSave={onSaveNote}
                deleteSlot={deleteSlot}
                index={i}
                onDragStart={handleDragStart}
                onHover={ui.setDropIndex}
                onDropAt={commitDrop}
                onDragEnd={ui.dragEnd}
                dragging={dragName === note.name}
                dragActive={dragName != null}
                onMouseEnter={() => {
                  if (canHover) ui.setHoverIndex(i);
                }}
                onMouseLeave={() => {
                  if (canHover && hoverIndex === i) ui.setHoverIndex(null);
                }}
              />
              {draftAfter === i && <DraftNote onSave={handleDraftSave} onDiscard={ui.closeDraft} />}
            </React.Fragment>
          );
        })}
        {orderedNotes.length > 0 && renderSeparator(orderedNotes.length)}
      </div>
    </div>
  );
}
