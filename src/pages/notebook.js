import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';

const OWNER = 'indulge';
const REPO = 'sachin-notebook';
const BRANCH = 'main';
const DOCS_PATH = 'docs';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

function slugify(text) {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function b64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64Decode(str) {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

// ── Metadata helpers ─────────────────────────────────────────────────────────
// The _metadata.json file holds note titles, the user-defined display order, and
// the last-updated timestamp (epoch millis) for each note.
// New format: { titles: { "file.md": "Title" }, order: [...], updated: { "file.md": 1700000000000 } }
// Legacy format: a flat { "file.md": "Title" } map (order derived from key order).

function parseMetadata(obj) {
  if (obj && typeof obj === 'object' && obj.titles && typeof obj.titles === 'object') {
    return {
      titles: obj.titles,
      order: Array.isArray(obj.order) ? obj.order : Object.keys(obj.titles),
      updated: obj.updated && typeof obj.updated === 'object' ? obj.updated : {},
    };
  }
  const titles = obj || {};
  return { titles, order: Object.keys(titles), updated: {} };
}

function serializeMetadata(titles, order, updated) {
  return JSON.stringify({ titles, order, updated: updated || {} }, null, 2);
}

// Last-updated epoch millis for a note: prefer the stored timestamp, then fall
// back to the epoch suffix in the filename ("<slug>-<epochMillis>.md").
function noteUpdatedAt(name, updated) {
  if (updated && updated[name]) return updated[name];
  const m = /-(\d{13})\.mdx?$/.exec(name);
  return m ? Number(m[1]) : null;
}

// Human-readable date + time, e.g. "Jun 7, 2026, 3:42 PM".
function formatTimestamp(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// Sort the GitHub file listing by the saved order; anything not in `order`
// (newly created, legacy) is appended to the end, never sorted alphabetically.
function orderNotes(notes, order) {
  const byName = new Map(notes.map(n => [n.name, n]));
  const seen = new Set();
  const result = [];
  for (const name of order || []) {
    const n = byName.get(name);
    if (n) { result.push(n); seen.add(name); }
  }
  for (const n of notes) {
    if (!seen.has(n.name)) result.push(n);
  }
  return result;
}

// Move `item` so it lands at insertion slot `index` (0..N) measured against the
// current list. Removing the item first shifts later slots down by one.
function moveToIndex(list, item, index) {
  const result = [...list];
  const from = result.indexOf(item);
  if (from === -1) return result;
  result.splice(from, 1);
  const target = from < index ? index - 1 : index;
  result.splice(target, 0, item);
  return result;
}

// ── Token gate ─────────────────────────────────────────────────────────────

function TokenGate({ onAuthenticated, onDismiss }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    const token = value.trim();
    if (!token) return;
    setTesting(true);
    setError('');
    try {
      const res = await fetch(`${API}/${DOCS_PATH}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      if (res.ok) {
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
          <button onClick={onDismiss} style={s.gateClose} title="Dismiss">✕</button>
        )}
        <h2 style={{ margin: '0 0 8px' }}>Connect to GitHub</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--ifm-color-emphasis-600)', fontSize: 14 }}>
          Paste your GitHub Personal Access Token (with <code>repo</code> scope) to start writing notes.
          It will be saved in your browser only.
        </p>
        <input
          type="password"
          placeholder="ghp_xxxxxxxxxxxx"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          style={s.input}
          autoFocus
        />
        {error && <p style={{ color: '#e53e3e', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
        <button onClick={handleSave} disabled={testing || !value.trim()} style={{ ...s.btn, ...s.btnPrimary, width: '100%' }}>
          {testing ? 'Verifying…' : 'Save Token & Continue'}
        </button>
        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--ifm-color-emphasis-500)', textAlign: 'center' }}>
          Token stays on this device. Never written to source code.
        </p>
      </div>
    </div>
  );
}


// ── Notebook sidebar ────────────────────────────────────────────────────────

function Sidebar({ notebooks, selected, onSelect, onNewNotebook, loading, onRefresh, refreshing }) {
  return (
    <aside style={s.sidebar}>
      <div style={s.sidebarHeader}>
        <span>My Notebooks</span>
        <button
          onClick={onRefresh}
          disabled={loading || refreshing}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', opacity: (loading || refreshing) ? 0.4 : 0.7, lineHeight: 1 }}
          title="Refresh all"
        >
          {refreshing ? '⟳' : '↻'}
        </button>
      </div>
      <div style={s.notebookList}>
        {loading && <div style={s.hint}>Loading…</div>}
        {!loading && notebooks.length === 0 && (
          <div style={s.hint}>No notebooks yet.<br />Create one below.</div>
        )}
        {notebooks.map(nb => (
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

// ── Expandable note tile (Jupyter-style inline expand/collapse) ───────────────

function ExpandableNote({
  note, title, updatedAt, expanded, onToggle, onLoad, onSave, deleteSlot,
  index, onDragStart, onHover, onDropAt, onDragEnd, dragging, dragActive,
  onMouseEnter, onMouseLeave,
}) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState('');
  const [baseContent, setBaseContent] = useState('');
  const [sha, setSha] = useState(null);
  const [editTitle, setEditTitle] = useState(title);
  const [baseTitle, setBaseTitle] = useState(title);
  const [renderMode, setRenderMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  // Keep the title field in sync with metadata when the user hasn't edited it.
  useEffect(() => {
    setEditTitle(prev => (prev === baseTitle ? title : prev));
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
      .catch(e => { if (!cancelled) setLoadError(e.message || 'Failed to load note.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = content !== baseContent || editTitle !== baseTitle;

  const handleSave = async (e) => {
    e?.stopPropagation();
    setSaving(true);
    setSaveError('');
    try {
      const newSha = await onSave(note, editTitle, content, sha);
      setSha(newSha);
      setBaseContent(content);
      setBaseTitle(editTitle);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (err) {
      setSaveError(err.message || 'Save failed.');
    }
    setSaving(false);
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
      onDragOver={e => {
        if (!dragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const after = e.clientY - rect.top > rect.height / 2;
        onHover(after ? index + 1 : index);
      }}
      onDrop={e => { e.preventDefault(); onDropAt(); }}
    >
      <div style={s.tileHeader} onClick={() => onToggle(note.name)}>
        <span
          style={s.dragHandle}
          className="note-drag-handle"
          title="Drag to reorder"
          draggable
          onClick={e => e.stopPropagation()}
          onDragStart={e => onDragStart(e, note.name)}
          onDragEnd={onDragEnd}
        >
          ⠿
        </span>
        <span style={{ ...s.tileChevron, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
        <span style={s.noteIcon}>📄</span>
        <span style={{ flex: 1, fontWeight: expanded ? 600 : 400 }}>
          {title || note.name.replace(/\.mdx?$/, '')}
        </span>
        {updatedAt && (
          <span style={s.tileUpdated} title={`Last updated ${formatTimestamp(updatedAt)}`}>
            {formatTimestamp(updatedAt)}
          </span>
        )}
        {isDirty && <span style={s.unsavedBadge}><span style={s.unsavedDot} />unsaved</span>}
        {deleteSlot}
      </div>

      {expanded && (
        <div style={s.tileBody} onClick={e => e.stopPropagation()}>
          {loading && <div style={s.hint}>Loading note…</div>}
          {loadError && <div style={{ ...s.hint, color: '#e53e3e' }}>{loadError}</div>}
          {loaded && (
            <>
              <div style={s.tileToolbar}>
                <div style={s.segmented}>
                  <button onClick={() => setRenderMode(false)} style={{ ...s.segment, ...(!renderMode ? s.segmentActive : {}) }}>✎ Edit</button>
                  <button onClick={() => setRenderMode(true)} style={{ ...s.segment, ...(renderMode ? s.segmentActive : {}) }}>👁 Preview</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {saveError && <span style={{ fontSize: 12, color: '#e53e3e' }}>{saveError}</span>}
                  <button
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    style={{ ...s.btn, ...(isDirty ? s.btnPrimary : s.btnSaved) }}
                  >
                    {saving ? 'Saving…' : justSaved ? '✓ Saved' : isDirty ? 'Save' : '✓ Saved'}
                  </button>
                </div>
              </div>
              {renderMode ? (
                <BrowserOnly fallback={<div style={s.tilePreview}>Loading preview…</div>}>
                  {() => {
                    const ReactMarkdown = require('react-markdown').default;
                    return (
                      <div style={s.tilePreview}>
                        <h2 style={s.previewTitle}>{editTitle.trim() || 'Untitled'}</h2>
                        <ReactMarkdown>{content}</ReactMarkdown>
                      </div>
                    );
                  }}
                </BrowserOnly>
              ) : (
                <>
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="Note title"
                    style={{ ...s.input, ...s.titleInput }}
                  />
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
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

// ── Draft note (a blank, unsaved note edited inline) ──────────────────────────

function DraftNote({ onSave, onDiscard }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [renderMode, setRenderMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const canSave = !!(title.trim() || content.trim());

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(title, content);
      // On success the parent unmounts this draft — don't touch state after.
    } catch (err) {
      setError(err.message || 'Save failed.');
      setSaving(false);
    }
  };

  return (
    <div style={{ ...s.noteItem, ...s.noteItemExpanded, ...s.draftItem }}>
      <div style={s.tileHeader}>
        <span style={s.noteIcon}>📝</span>
        <span style={{ flex: 1, fontWeight: 600, color: 'var(--ifm-color-primary)' }}>New note</span>
        <button onClick={onDiscard} style={{ ...s.btn, ...s.btnGhost }} disabled={saving}>Discard</button>
      </div>
      <div style={s.tileBody}>
        <div style={s.tileToolbar}>
          <div style={s.segmented}>
            <button onClick={() => setRenderMode(false)} style={{ ...s.segment, ...(!renderMode ? s.segmentActive : {}) }}>✎ Edit</button>
            <button onClick={() => setRenderMode(true)} style={{ ...s.segment, ...(renderMode ? s.segmentActive : {}) }}>👁 Preview</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {error && <span style={{ fontSize: 12, color: '#e53e3e' }}>{error}</span>}
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              style={{ ...s.btn, ...(canSave ? s.btnPrimary : s.btnSaved) }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {renderMode ? (
          <BrowserOnly fallback={<div style={s.tilePreview}>Loading preview…</div>}>
            {() => {
              const ReactMarkdown = require('react-markdown').default;
              return (
                <div style={s.tilePreview}>
                  <h2 style={s.previewTitle}>{title.trim() || 'Untitled'}</h2>
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              );
            }}
          </BrowserOnly>
        ) : (
          <>
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Note title"
              style={{ ...s.input, ...s.titleInput }}
            />
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your note in Markdown…"
              style={{ ...s.textarea, ...s.tileTextarea }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Note list ───────────────────────────────────────────────────────────────

function NoteList({ notebook, notes, loading, onDeleteNote, syncing, syncProgress, metadata, onLoadNote, onSaveNote, onReorder, onCreateNote }) {
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [dragName, setDragName] = useState(null);
  const [dropIndex, setDropIndex] = useState(null); // insertion slot: 0..N
  const [hoverIndex, setHoverIndex] = useState(null); // tile index whose "add below" affordance is shown
  const [draftAfter, setDraftAfter] = useState(null); // tile index to insert a blank draft after; -1 = top/empty

  // Collapse everything when switching notebooks.
  useEffect(() => {
    setExpanded(new Set());
    setConfirmingDelete(null);
    setDragName(null);
    setDropIndex(null);
    setHoverIndex(null);
    setDraftAfter(null);
  }, [notebook.name]);

  const orderedNotes = orderNotes(notes, metadata?.order);
  const hasDraft = draftAfter !== null;

  const startDraft = (afterIndex) => {
    setHoverIndex(null);
    setDraftAfter(afterIndex);
  };

  const handleDraftSave = async (title, content) => {
    const displayNames = orderedNotes.map(n => n.name);
    const at = draftAfter;
    const preceding = displayNames.slice(0, at + 1);
    const following = displayNames.slice(at + 1);
    await onCreateNote(preceding, following, title, content);
    setDraftAfter(null);
  };

  const toggle = (name) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleDragStart = (e, name) => {
    setDragName(name);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for a drag to start.
    try { e.dataTransfer.setData('text/plain', name); } catch {}
  };

  const hover = (idx) => { setDropIndex(prev => (prev === idx ? prev : idx)); };

  const commitDrop = () => {
    if (dragName != null && dropIndex != null) {
      const currentOrder = orderedNotes.map(n => n.name);
      const newOrder = moveToIndex(currentOrder, dragName, dropIndex);
      if (newOrder.join('\n') !== currentOrder.join('\n')) onReorder(newOrder);
    }
    setDragName(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    setDragName(null);
    setDropIndex(null);
  };

  // The gap between/around tiles. Doubles as (a) the drag drop target showing an
  // insertion line, and (b) the hover zone that reveals a "+ New Note" button to
  // insert a blank note below tile `slot - 1`.
  const renderSeparator = (slot) => {
    const belowIndex = slot - 1; // the tile this gap sits below
    const canAdd = belowIndex >= 0 && !hasDraft && dragName == null;
    const showAdd = canAdd && hoverIndex === belowIndex;
    return (
      <div
        style={s.dropSeparator}
        onDragOver={e => { if (dragName != null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; hover(slot); } }}
        onDrop={e => { e.preventDefault(); commitDrop(); }}
        onMouseEnter={() => { if (canAdd) setHoverIndex(belowIndex); }}
        onMouseLeave={() => { if (canAdd) setHoverIndex(prev => (prev === belowIndex ? null : prev)); }}
      >
        <div style={{ ...s.dropSeparatorLine, ...(dropIndex === slot ? s.dropSeparatorLineActive : {}) }} />
        {showAdd && (
          <div className="note-add-affordance" style={s.addAffordance}>
            <button
              style={s.addBtn}
              onClick={() => startDraft(belowIndex)}
              title="Insert a new note here"
            >
              + New Note
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleDeleteClick = (e, note) => {
    e.stopPropagation();
    setConfirmingDelete(note.name);
  };

  const handleConfirmDelete = (e, note) => {
    e.stopPropagation();
    setConfirmingDelete(null);
    onDeleteNote(note);
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setConfirmingDelete(null);
  };

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{notebook.name}</span>
        <button
          onClick={() => startDraft(orderedNotes.length - 1)}
          disabled={hasDraft}
          style={{ ...s.btn, ...s.btnPrimary, ...(hasDraft ? s.btnDisabled : {}) }}
        >
          + New Note
        </button>
      </div>
      <div style={s.syncBarTrack}>
        <div style={{
          ...s.syncBarFill,
          width: syncing ? `${syncProgress}%` : '0%',
          opacity: syncing ? 1 : 0,
          transition: syncing ? 'width 0.3s ease' : 'opacity 0.4s ease',
        }} />
      </div>
      <div style={s.noteListBody}>
        {loading && <div style={s.hint}>Loading notes…</div>}
        {!loading && orderedNotes.length === 0 && !hasDraft && (
          <div className="note-empty-zone" style={s.emptyZone} onClick={() => startDraft(-1)}>
            <span className="note-empty-prompt" style={s.emptyPrompt}>No notes yet</span>
            <button className="note-empty-btn" style={s.emptyAddBtn} onClick={() => startDraft(-1)}>
              + Create new Note
            </button>
          </div>
        )}
        {!loading && orderedNotes.length === 0 && hasDraft && (
          <DraftNote onSave={handleDraftSave} onDiscard={() => setDraftAfter(null)} />
        )}
        {orderedNotes.map((note, i) => {
          const title = metadata?.titles?.[note.name] || note.name.replace(/\.mdx?$/, '');
          const deleteSlot = confirmingDelete === note.name ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} onClick={e => e.stopPropagation()}>
              <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Delete?</span>
              <button onClick={e => handleConfirmDelete(e, note)} style={{ ...s.btn, ...s.btnDanger, padding: '3px 8px' }}>Yes</button>
              <button onClick={handleCancelDelete} style={{ ...s.btn, ...s.btnGhost, padding: '3px 8px' }}>No</button>
            </span>
          ) : (
            <button onClick={e => handleDeleteClick(e, note)} style={s.deleteBtn} className="note-delete-btn" title="Delete note">
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
                onToggle={toggle}
                onLoad={onLoadNote}
                onSave={onSaveNote}
                deleteSlot={deleteSlot}
                index={i}
                onDragStart={handleDragStart}
                onHover={hover}
                onDropAt={commitDrop}
                onDragEnd={handleDragEnd}
                dragging={dragName === note.name}
                dragActive={dragName != null}
                onMouseEnter={() => { if (canHover) setHoverIndex(i); }}
                onMouseLeave={() => { if (canHover) setHoverIndex(prev => (prev === i ? null : prev)); }}
              />
              {draftAfter === i && (
                <DraftNote onSave={handleDraftSave} onDiscard={() => setDraftAfter(null)} />
              )}
            </React.Fragment>
          );
        })}
        {orderedNotes.length > 0 && renderSeparator(orderedNotes.length)}
      </div>
    </div>
  );
}

// ── Note editor ─────────────────────────────────────────────────────────────

function NoteEditor({ onBack, onSave, notebookName = '', initialTitle = '', initialContent = '', saving, status, conflictBanner, onClearConflict }) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [renderMode, setRenderMode] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const textareaRef = useRef(null);

  // Baseline = last persisted state. Resyncs when the parent pushes new saved
  // values (after a successful save), which clears the "unsaved" indicator.
  const [baseTitle, setBaseTitle] = useState(initialTitle);
  const [baseContent, setBaseContent] = useState(initialContent);
  useEffect(() => {
    setBaseTitle(initialTitle);
    setBaseContent(initialContent);
  }, [initialTitle, initialContent]);

  const isDirty = title !== baseTitle || content !== baseContent;

  useEffect(() => {
    if (!renderMode && textareaRef.current) textareaRef.current.focus();
  }, [renderMode]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saving && isDirty) onSave(title, content);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [title, content, saving, isDirty, onSave]);

  const handleExit = () => {
    if (isDirty) setDiscardConfirm(true);
    else onBack();
  };

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button onClick={handleExit} style={{ ...s.btn, ...s.btnGhost, flexShrink: 0 }}>← Notes</button>
          <div style={s.breadcrumb}>
            {notebookName && <><span style={s.crumbMuted}>{notebookName}</span><span style={s.crumbSep}>›</span></>}
            <span style={s.crumbCurrent}>{title.trim() || 'Untitled'}</span>
            {isDirty && <span style={s.unsavedBadge}><span style={s.unsavedDot} />unsaved</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {discardConfirm ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--ifm-color-emphasis-600)' }}>Discard unsaved changes?</span>
              <button onClick={onBack} style={{ ...s.btn, ...s.btnDanger, padding: '3px 10px', fontSize: 12 }}>Discard</button>
              <button onClick={() => setDiscardConfirm(false)} style={{ ...s.btn, ...s.btnGhost, padding: '3px 10px', fontSize: 12 }}>Keep editing</button>
            </span>
          ) : (
            <>
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
              <span style={s.btnSeparator} />
              <button
                onClick={() => onSave(title, content)}
                disabled={saving || !isDirty}
                style={{ ...s.btn, ...(isDirty ? s.btnPrimary : s.btnSaved) }}
              >
                {saving ? 'Saving…' : isDirty ? 'Save Note' : '✓ Saved'}
              </button>
            </>
          )}
        </div>
      </div>
      <div style={s.editorBody}>
        {conflictBanner && (
          <div style={s.conflictBanner}>
            <span>⚠️ Merge conflict detected. The file was updated remotely. The latest SHA has been loaded and your edits are preserved — review and save again.</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => onSave(title, content)} style={{ ...s.btn, ...s.btnPrimary, fontSize: 12, padding: '4px 10px' }}>
                Retry Save
              </button>
              <button onClick={onClearConflict} style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '4px 10px' }}>
                Dismiss
              </button>
            </div>
          </div>
        )}
        {renderMode ? (
          <BrowserOnly fallback={<div style={s.markdownPreview}>Loading preview…</div>}>
            {() => {
              const ReactMarkdown = require('react-markdown').default;
              return (
                <div style={s.markdownPreview}>
                  <h1 style={s.previewTitle}>{title.trim() || 'Untitled'}</h1>
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              );
            }}
          </BrowserOnly>
        ) : (
          <>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Note title"
              style={{ ...s.input, ...s.titleInput }}
            />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your note in Markdown…"
              style={s.textarea}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── New notebook form ───────────────────────────────────────────────────────

function NewNotebookPanel({ onCreate, onCancel, saving, status }) {
  const [name, setName] = useState('');
  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <button onClick={onCancel} style={{ ...s.btn, ...s.btnGhost }}>← Back</button>
      </div>
      <div style={s.editorBody}>
        <h3 style={{ margin: '0 0 16px' }}>Create New Notebook</h3>
        <label style={s.label}>Notebook name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onCreate(name)}
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

// ── Notebook create modal ───────────────────────────────────────────────────

function NotebookModal({ step, error, onClose }) {
  const info = {
    creating: { label: 'Creating notebook…',         color: 'var(--ifm-color-primary)' },
    syncing:  { label: 'Verifying in repository…',   color: 'var(--ifm-color-primary)' },
    done:     { label: '✓ Notebook created',          color: '#38a169' },
    error:    { label: '✕ Failed to create',          color: '#e53e3e' },
  };
  const { label, color } = info[step] ?? info.creating;
  return (
    <div style={s.modalOverlay}>
      <div style={s.modalCard}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: step === 'done' ? 0 : 14, color }}>
          {label}
        </div>
        {(step === 'creating' || step === 'syncing') && (
          <div style={s.modalProgressTrack}>
            <div style={{ height: '100%', borderRadius: 3, width: step === 'syncing' ? '80%' : '40%', backgroundColor: color, opacity: 0.7, transition: 'width 0.4s ease' }} />
          </div>
        )}
        {step === 'error' && (
          <>
            {error && <p style={{ fontSize: 13, color: '#e53e3e', margin: '10px 0 0' }}>{error}</p>}
            <button onClick={onClose} style={{ ...s.btn, ...s.btnGhost, marginTop: 14 }}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Save modal ──────────────────────────────────────────────────────────────

function SaveModal({ step, progress, error, onClose }) {
  const info = {
    pushing:  { label: 'Pushing to GitHub…',          color: 'var(--ifm-color-primary)' },
    syncing:  { label: 'Verifying in repository…',     color: 'var(--ifm-color-primary)' },
    done:     { label: '✓ Saved successfully!',        color: '#38a169' },
    error:    { label: '✕ Save failed',                color: '#e53e3e' },
  };
  const { label, color } = info[step] ?? info.pushing;

  return (
    <div style={s.modalOverlay}>
      <div style={s.modalCard}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14, color }}>
          {label}
        </div>
        <div style={s.modalProgressTrack}>
          <div style={{
            height: '100%',
            borderRadius: 3,
            width: `${progress}%`,
            backgroundColor: color,
            transition: 'width 0.25s ease',
          }} />
        </div>
        {step === 'error' && (
          <>
            {error && <p style={{ fontSize: 13, color: '#e53e3e', margin: '10px 0 0' }}>{error}</p>}
            <button onClick={onClose} style={{ ...s.btn, ...s.btnGhost, marginTop: 14 }}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ ...s.panel, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--ifm-color-emphasis-500)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📓</div>
        <p style={{ fontSize: 16, margin: 0 }}>Select a notebook from the sidebar,<br />or create a new one.</p>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function NotebookPage() {
  const [pat, setPat] = useState(null);
  const [notebooks, setNotebooks] = useState([]);
  const [selectedNotebook, setSelectedNotebook] = useState(null);
  const [notes, setNotes] = useState([]);
  const [view, setView] = useState('list'); // 'list' | 'edit' | 'new-notebook'
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [editingNote, setEditingNote] = useState(null); // { path, sha, title, content }
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [saveModal, setSaveModal] = useState({ open: false, step: 'idle', progress: 0, error: null });
  const [conflictBanner, setConflictBanner] = useState(false);
  const [notebookMetadata, setNotebookMetadata] = useState({ titles: {}, order: [], updated: {}, sha: null });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [loadingNote, setLoadingNote] = useState(null);
  const [notebookModal, setNotebookModal] = useState({ open: false, step: 'idle', error: null });
  const syncIntervalRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('gh_pat') : null;
    if (saved) setPat(saved);
  }, []);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }), [pat]);

  const fetchNotebooks = useCallback(async () => {
    setLoadingNotebooks(true);
    try {
      const res = await fetch(`${API}/${DOCS_PATH}?ref=${BRANCH}&_=${Date.now()}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNotebooks(data.filter(i => i.type === 'dir'));
      }
    } catch { /* network error */ }
    setLoadingNotebooks(false);
  }, [authHeaders]);

  useEffect(() => {
    if (pat) fetchNotebooks();
  }, [pat, fetchNotebooks]);

  const fetchNotes = useCallback(async (notebook) => {
    setLoadingNotes(true);
    try {
      const res = await fetch(`${API}/${DOCS_PATH}/${notebook.name}?ref=${BRANCH}&_=${Date.now()}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.filter(i => i.type === 'file' && /\.mdx?$/.test(i.name) && !i.name.startsWith('_')));
      }
    } catch { /* network error */ }
    setLoadingNotes(false);
  }, [authHeaders]);

  const fetchMetadata = useCallback(async (notebook) => {
    try {
      const res = await fetch(
        `${API}/${DOCS_PATH}/${notebook.name}/_metadata.json?ref=${BRANCH}&_=${Date.now()}`,
        { headers: authHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        const { titles, order, updated } = parseMetadata(JSON.parse(b64Decode(data.content)));
        setNotebookMetadata({ titles, order, updated, sha: data.sha });
        return;
      }
    } catch {}
    setNotebookMetadata({ titles: {}, order: [], updated: {}, sha: null });
  }, [authHeaders]);

  const pushMetadataUpdate = useCallback(async (notebook, newTitles, newOrder, newUpdated, currentSha) => {
    const body = {
      message: 'chore: update note metadata',
      content: b64Encode(serializeMetadata(newTitles, newOrder, newUpdated)),
      branch: BRANCH,
    };
    if (currentSha) body.sha = currentSha;
    try {
      const res = await fetch(`${API}/${DOCS_PATH}/${notebook.name}/_metadata.json`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(body),
      });
      if (res.ok) {
        const resData = await res.json();
        return resData.content.sha;
      }
    } catch {}
    return currentSha;
  }, [authHeaders]);

  const startSyncPoll = useCallback((fileName, notebook, mode = 'appeared') => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

    let progress = 0;
    setSyncing(true);
    setSyncProgress(0);

    syncIntervalRef.current = setInterval(() => {
      progress = Math.min(progress + 1, 85);
      setSyncProgress(progress);
    }, 150);

    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const res = await fetch(
          `${API}/${DOCS_PATH}/${notebook.name}?ref=${BRANCH}&_=${Date.now()}`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          const files = data.filter(i => i.type === 'file' && /\.mdx?$/.test(i.name) && !i.name.startsWith('_'));
          const conditionMet = mode === 'appeared'
            ? files.some(f => f.name === fileName)
            : !files.some(f => f.name === fileName);
          if (conditionMet) {
            clearInterval(syncIntervalRef.current);
            setSyncProgress(100);
            setNotes(files);
            syncTimeoutRef.current = setTimeout(() => setSyncing(false), 600);
            return;
          }
        }
      } catch {}
      if (attempts < 8) {
        syncTimeoutRef.current = setTimeout(poll, 2000);
      } else {
        clearInterval(syncIntervalRef.current);
        setSyncing(false);
      }
    };

    syncTimeoutRef.current = setTimeout(poll, 1500);
  }, [authHeaders]);

  const selectNotebook = (nb) => {
    setSelectedNotebook(nb);
    setView('list');
    setStatus('');
    setNotebookMetadata({ titles: {}, order: [], updated: {}, sha: null });
    fetchNotes(nb);
    fetchMetadata(nb);
  };

  const handleNewNotebook = () => { setView('new-notebook'); setStatus(''); };

  const createNotebook = async (name) => {
    const slug = slugify(name);
    const catJson = JSON.stringify({ label: name, position: notebooks.length + 2 }, null, 2);
    setNotebookModal({ open: true, step: 'creating', error: null });

    // Step 1: write _category_.json
    let res;
    try {
      res = await fetch(`${API}/${DOCS_PATH}/${slug}/_category_.json`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          message: `Create notebook: ${name}`,
          content: b64Encode(catJson),
          branch: BRANCH,
        }),
      });
    } catch (e) {
      setNotebookModal({ open: true, step: 'error', error: e.message });
      return;
    }
    if (!res.ok) {
      let msg = 'Unknown error';
      try { msg = (await res.json()).message; } catch {}
      setNotebookModal({ open: true, step: 'error', error: msg });
      return;
    }

    // Step 2: poll until the folder appears in the notebooks listing
    setNotebookModal({ open: true, step: 'syncing', error: null });
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const r = await fetch(`${API}/${DOCS_PATH}?ref=${BRANCH}&_=${Date.now()}`, { headers: authHeaders() });
        if (r.ok) {
          const allNotebooks = (await r.json()).filter(i => i.type === 'dir');
          const newNb = allNotebooks.find(nb => nb.name === slug);
          if (newNb) {
            setNotebooks(allNotebooks);
            setSelectedNotebook(newNb);
            setView('list');
            setNotebookMetadata({ titles: {}, order: [], updated: {}, sha: null });
            fetchNotes(newNb);
            fetchMetadata(newNb);
            setNotebookModal({ open: true, step: 'done', error: null });
            setTimeout(() => setNotebookModal({ open: false, step: 'idle', error: null }), 1200);
            return;
          }
        }
      } catch {}
      if (attempts < 12) {
        setTimeout(poll, 2000);
      } else {
        // Timed out — dismiss and let the user refresh manually
        setNotebookModal({ open: false, step: 'idle', error: null });
      }
    };
    setTimeout(poll, 1500);
  };

  const deleteNote = async (note) => {
    try {
      const res = await fetch(`${API}/${DOCS_PATH}/${selectedNotebook.name}/${note.name}`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({
          message: `Delete note: ${note.name}`,
          sha: note.sha,
          branch: BRANCH,
        }),
      });
      if (res.ok) {
        const newTitles = { ...notebookMetadata.titles };
        delete newTitles[note.name];
        const newOrder = notebookMetadata.order.filter(n => n !== note.name);
        const newUpdated = { ...notebookMetadata.updated };
        delete newUpdated[note.name];
        const newMetaSha = await pushMetadataUpdate(selectedNotebook, newTitles, newOrder, newUpdated, notebookMetadata.sha);
        setNotebookMetadata({ titles: newTitles, order: newOrder, updated: newUpdated, sha: newMetaSha });
        startSyncPoll(note.name, selectedNotebook, 'gone');
      } else {
        const err = await res.json();
        setStatus(`Error: ${err.message}`);
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    setRefreshProgress(0);
    let prog = 0;
    const tick = setInterval(() => {
      prog = Math.min(prog + 3, 85);
      setRefreshProgress(prog);
    }, 80);

    // 1. Refresh notebooks list
    fetchNotebooks();

    // 2. Refresh notes + metadata for the selected notebook
    let freshTitles = {};
    if (selectedNotebook) {
      fetchNotes(selectedNotebook);
      try {
        const res = await fetch(
          `${API}/${DOCS_PATH}/${selectedNotebook.name}/_metadata.json`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          const parsed = parseMetadata(JSON.parse(b64Decode(data.content)));
          freshTitles = parsed.titles;
          setNotebookMetadata({ titles: parsed.titles, order: parsed.order, updated: parsed.updated, sha: data.sha });
        } else {
          setNotebookMetadata({ titles: {}, order: [], updated: {}, sha: null });
        }
      } catch {}
    }

    // 3. Re-fetch the open note so its content and SHA are current
    if (view === 'edit' && editingNote) {
      try {
        const res = await fetch(`${API}/${editingNote.path}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          const raw = b64Decode(data.content);
          const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
          const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
          const content = body;
          const fileName = editingNote.path.split('/').pop();
          const title = freshTitles[fileName] || editingNote.title;
          setEditingNote(prev => prev
            ? { ...prev, sha: data.sha, content, title, _refreshKey: (prev._refreshKey || 0) + 1 }
            : null
          );
        }
      } catch {}
    }

    clearInterval(tick);
    setRefreshProgress(100);
    setTimeout(() => { setRefreshing(false); setRefreshProgress(0); }, 500);
  };

  const openNewNote = () => {
    setEditingNote(null);
    setView('edit');
    setStatus('');
  };

  const openNote = async (note) => {
    if (loadingNote) return;
    setLoadingNote(note.name);
    setStatus('');
    try {
      const res = await fetch(`${API}/${DOCS_PATH}/${selectedNotebook.name}/${note.name}?ref=${BRANCH}&_=${Date.now()}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const raw = b64Decode(data.content);
        // Strip frontmatter (backwards compat with old saved notes)
        const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
        const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
        const content = body;
        const title = notebookMetadata.titles[note.name] || '';
        setEditingNote({ path: `${DOCS_PATH}/${selectedNotebook.name}/${note.name}`, sha: data.sha, title, content });
        setView('edit');
      } else {
        setStatus('Failed to load note.');
      }
    } catch (e) {
      setStatus(`Error loading note: ${e.message}`);
    }
    setLoadingNote(null);
  };

  // ── Inline (Jupyter-style) load + save for the tiles view ────────────────
  const loadNoteContent = useCallback(async (note) => {
    const res = await fetch(
      `${API}/${DOCS_PATH}/${selectedNotebook.name}/${note.name}?ref=${BRANCH}&_=${Date.now()}`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error('Failed to load note.');
    const data = await res.json();
    const raw = b64Decode(data.content);
    // Strip frontmatter (backwards compat with old saved notes)
    const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
    const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
    return { content: body, sha: data.sha };
  }, [authHeaders, selectedNotebook]);

  const saveNoteContent = useCallback(async (note, title, content, sha) => {
    const noteTitle = title.trim() || 'untitled';
    const filePath = `${DOCS_PATH}/${selectedNotebook.name}/${note.name}`;
    const body = {
      message: `Update: ${noteTitle}`,
      content: b64Encode(content),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;
    const res = await fetch(`${API}/${filePath}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = 'Save failed.';
      try { msg = (await res.json()).message; } catch {}
      throw new Error(msg);
    }
    const resData = await res.json();
    const newSha = resData.content?.sha ?? sha;
    // Keep the human-readable title in the notebook metadata; order is unchanged
    // for an existing note, but make sure it's tracked in the order list.
    const newTitles = { ...notebookMetadata.titles, [note.name]: noteTitle };
    const newOrder = notebookMetadata.order.includes(note.name)
      ? notebookMetadata.order
      : [...notebookMetadata.order, note.name];
    const newUpdated = { ...notebookMetadata.updated, [note.name]: Date.now() };
    const newMetaSha = await pushMetadataUpdate(selectedNotebook, newTitles, newOrder, newUpdated, notebookMetadata.sha);
    setNotebookMetadata({ titles: newTitles, order: newOrder, updated: newUpdated, sha: newMetaSha });
    return newSha;
  }, [authHeaders, selectedNotebook, notebookMetadata, pushMetadataUpdate]);

  // Persist a drag-and-drop reordering. Optimistically updates local state.
  const reorderNotes = useCallback(async (newOrder) => {
    setNotebookMetadata(prev => ({ ...prev, order: newOrder }));
    const newMetaSha = await pushMetadataUpdate(
      selectedNotebook, notebookMetadata.titles, newOrder, notebookMetadata.updated, notebookMetadata.sha
    );
    setNotebookMetadata(prev => ({ ...prev, order: newOrder, sha: newMetaSha }));
  }, [selectedNotebook, notebookMetadata, pushMetadataUpdate]);

  // Create a brand-new note from an inline draft, placed between `preceding` and
  // `following` (arrays of existing note filenames in display order).
  const createNoteInline = useCallback(async (preceding, following, title, content) => {
    const noteTitle = title.trim() || 'untitled';
    const fileName = `${slugify(noteTitle)}-${Date.now()}.md`;
    const filePath = `${DOCS_PATH}/${selectedNotebook.name}/${fileName}`;
    const res = await fetch(`${API}/${filePath}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ message: `Create note: ${noteTitle}`, content: b64Encode(content), branch: BRANCH }),
    });
    if (!res.ok) {
      let msg = 'Create failed.';
      try { msg = (await res.json()).message; } catch {}
      throw new Error(msg);
    }
    const resData = await res.json();
    const newSha = resData.content?.sha ?? null;

    const newOrder = [...preceding, fileName, ...following];
    const newTitles = { ...notebookMetadata.titles, [fileName]: noteTitle };
    const newUpdated = { ...notebookMetadata.updated, [fileName]: Date.now() };
    const newMetaSha = await pushMetadataUpdate(selectedNotebook, newTitles, newOrder, newUpdated, notebookMetadata.sha);
    setNotebookMetadata({ titles: newTitles, order: newOrder, updated: newUpdated, sha: newMetaSha });

    // Surface the new file as a real tile right away.
    setNotes(prev => prev.some(n => n.name === fileName)
      ? prev
      : [...prev, { name: fileName, sha: newSha, type: 'file', path: filePath }]);
  }, [authHeaders, selectedNotebook, notebookMetadata, pushMetadataUpdate]);

  const saveNote = async (title, content) => {
    setConflictBanner(false);
    setSaving(true);

    const noteTitle = title.trim() || 'untitled';
    const fileName = editingNote ? editingNote.path.split('/').pop() : `${slugify(noteTitle)}-${Date.now()}.md`;
    const filePath = editingNote ? editingNote.path : `${DOCS_PATH}/${selectedNotebook.name}/${fileName}`;

    // ── Phase 1: push ──────────────────────────────────────────────────────
    setSaveModal({ open: true, step: 'pushing', progress: 5, error: null });
    let pushProg = 5;
    const pushTick = setInterval(() => {
      pushProg = Math.min(pushProg + 4, 45);
      setSaveModal(prev => ({ ...prev, progress: pushProg }));
    }, 80);

    let res;
    try {
      const body = {
        message: editingNote ? `Update: ${noteTitle}` : `Create note: ${noteTitle}`,
        content: b64Encode(content),
        branch: BRANCH,
      };
      if (editingNote?.sha) body.sha = editingNote.sha;
      res = await fetch(`${API}/${filePath}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(body),
      });
    } catch (e) {
      clearInterval(pushTick);
      setSaveModal({ open: true, step: 'error', progress: 0, error: e.message });
      setSaving(false);
      return;
    }
    clearInterval(pushTick);

    // ── 409 merge conflict ─────────────────────────────────────────────────
    if (res.status === 409) {
      setSaveModal({ open: false, step: 'idle', progress: 0, error: null });
      try {
        const latest = await fetch(`${API}/${filePath}`, { headers: authHeaders() });
        if (latest.ok) {
          const data = await latest.json();
          setEditingNote(prev => prev ? { ...prev, sha: data.sha } : { path: filePath, sha: data.sha, title, content });
        }
      } catch {}
      setConflictBanner(true);
      setSaving(false);
      return;
    }

    // ── other HTTP errors ──────────────────────────────────────────────────
    if (!res.ok) {
      let errMsg = 'Unknown error';
      try { errMsg = (await res.json()).message; } catch {}
      setSaveModal({ open: true, step: 'error', progress: 0, error: errMsg });
      setSaving(false);
      return;
    }

    // Push succeeded — capture expected SHA, update state and metadata
    let expectedSha = null;
    try {
      const resData = await res.json();
      if (resData.content?.sha) {
        expectedSha = resData.content.sha;
        // Persist the saved title/content as the new baseline so the editor
        // clears its "unsaved" state; also promotes a new note to an opened one.
        setEditingNote(prev => prev
          ? { ...prev, sha: expectedSha, title, content }
          : { path: filePath, sha: expectedSha, title, content });
      }
    } catch {}

    const newTitles = { ...notebookMetadata.titles, [fileName]: noteTitle };
    // New notes go to the end of the list (never sorted alphabetically).
    const newOrder = notebookMetadata.order.includes(fileName)
      ? notebookMetadata.order
      : [...notebookMetadata.order, fileName];
    const newUpdated = { ...notebookMetadata.updated, [fileName]: Date.now() };
    const newMetaSha = await pushMetadataUpdate(selectedNotebook, newTitles, newOrder, newUpdated, notebookMetadata.sha);
    setNotebookMetadata({ titles: newTitles, order: newOrder, updated: newUpdated, sha: newMetaSha });

    // ── Phase 2: poll file directly until SHA matches expected ─────────────
    setSaveModal({ open: true, step: 'syncing', progress: 50, error: null });
    let syncProg = 50;
    const syncTick = setInterval(() => {
      syncProg = Math.min(syncProg + 1, 90);
      setSaveModal(prev => ({ ...prev, progress: syncProg }));
    }, 150);

    const finish = async () => {
      clearInterval(syncTick);
      // Refresh the notes list once confirmed
      try {
        const listR = await fetch(
          `${API}/${DOCS_PATH}/${selectedNotebook.name}?ref=${BRANCH}&_=${Date.now()}`,
          { headers: authHeaders() }
        );
        if (listR.ok) {
          const files = (await listR.json()).filter(
            i => i.type === 'file' && /\.mdx?$/.test(i.name) && !i.name.startsWith('_')
          );
          setNotes(files);
        }
      } catch {}
      setSaveModal({ open: true, step: 'done', progress: 100, error: null });
      setTimeout(() => setSaveModal({ open: false, step: 'idle', progress: 0, error: null }), 1000);
      setSaving(false);
    };

    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const r = await fetch(
          `${API}/${filePath}?ref=${BRANCH}&_=${Date.now()}`,
          { headers: authHeaders() }
        );
        if (r.ok) {
          const fileData = await r.json();
          // Confirmed when SHA matches (or no expected SHA to check against)
          if (!expectedSha || fileData.sha === expectedSha) {
            await finish();
            return;
          }
        }
      } catch {}
      if (attempts < 12) { setTimeout(poll, 2000); }
      else { await finish(); }
    };
    setTimeout(poll, 1500);
  };

  const [showTokenDialog, setShowTokenDialog] = useState(false);

  const forgetToken = () => {
    localStorage.removeItem('gh_pat');
    setPat(null);
    setShowTokenDialog(false);
  };

  if (!pat && !showTokenDialog) {
    return (
      <Layout title="Notebook" description="Write notes">
        <TokenGate onAuthenticated={setPat} />
      </Layout>
    );
  }

  if (showTokenDialog) {
    return (
      <Layout title="Notebook" description="Write notes">
        <TokenGate
          onAuthenticated={(token) => { setPat(token); setShowTokenDialog(false); }}
          onDismiss={() => setShowTokenDialog(false)}
        />
      </Layout>
    );
  }

  return (
    <Layout title="Notebook" description="Write notes">
      <div style={s.workspace}>
        {(refreshing || refreshProgress > 0) && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 100, backgroundColor: 'var(--ifm-color-emphasis-200)' }}>
            <div style={{
              height: '100%',
              width: `${refreshProgress}%`,
              backgroundColor: 'var(--ifm-color-primary)',
              transition: refreshProgress < 100 ? 'width 0.12s ease' : 'width 0.3s ease',
            }} />
          </div>
        )}
        <Sidebar
          notebooks={notebooks}
          selected={selectedNotebook}
          onSelect={selectNotebook}
          onNewNotebook={handleNewNotebook}
          loading={loadingNotebooks}
          onRefresh={refreshAll}
          refreshing={refreshing}
        />
        <main style={s.main}>
          {view === 'new-notebook' && (
            <NewNotebookPanel
              onCreate={createNotebook}
              onCancel={() => setView('list')}
              saving={saving}
              status={status}
            />
          )}
          {view === 'edit' && (
            <NoteEditor
              key={editingNote ? `${editingNote.path}-${editingNote._refreshKey ?? 0}` : 'new'}
              onBack={() => setView('list')}
              onSave={saveNote}
              notebookName={selectedNotebook?.name ?? ''}
              initialTitle={editingNote?.title ?? ''}
              initialContent={editingNote?.content ?? ''}
              saving={saving}
              status={status}
              conflictBanner={conflictBanner}
              onClearConflict={() => setConflictBanner(false)}
            />
          )}
          {view === 'list' && selectedNotebook && (
            <NoteList
              notebook={selectedNotebook}
              notes={notes}
              loading={loadingNotes}
              onDeleteNote={deleteNote}
              metadata={notebookMetadata}
              onLoadNote={loadNoteContent}
              onSaveNote={saveNoteContent}
              onReorder={reorderNotes}
              onCreateNote={createNoteInline}
              syncing={syncing}
              syncProgress={syncProgress}
            />
          )}
          {view === 'list' && !selectedNotebook && <EmptyState />}
        </main>
        {saveModal.open && (
          <SaveModal
            step={saveModal.step}
            progress={saveModal.progress}
            error={saveModal.error}
            onClose={() => setSaveModal({ open: false, step: 'idle', progress: 0, error: null })}
          />
        )}
        {notebookModal.open && (
          <NotebookModal
            step={notebookModal.step}
            error={notebookModal.error}
            onClose={() => setNotebookModal({ open: false, step: 'idle', error: null })}
          />
        )}
        <button onClick={() => setShowTokenDialog(true)} style={s.forgetBtn} title="Change GitHub token">
          🔑
        </button>
      </div>
    </Layout>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  gate: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '70vh',
    padding: 24,
  },
  gateCard: {
    maxWidth: 460,
    width: '100%',
    padding: 32,
    border: '1px solid var(--ifm-color-emphasis-300)',
    borderRadius: 12,
    backgroundColor: 'var(--ifm-background-surface-color)',
    position: 'relative',
  },
  gateClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--ifm-color-emphasis-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  workspace: {
    display: 'flex',
    height: 'calc(100vh - 60px)',
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    width: 240,
    flexShrink: 0,
    borderRight: '1px solid var(--ifm-color-emphasis-300)',
    backgroundColor: 'var(--ifm-background-surface-color)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarHeader: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--ifm-color-emphasis-300)',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ifm-color-emphasis-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notebookList: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 0',
  },
  notebookItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 16px',
    border: 'none',
    borderLeft: '3px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--ifm-font-color-base)',
    textAlign: 'left',
  },
  notebookItemActive: {
    borderLeft: '3px solid var(--ifm-color-primary)',
    backgroundColor: 'var(--ifm-color-emphasis-100)',
    fontWeight: 600,
    color: 'var(--ifm-color-primary)',
  },
  notebookIcon: { fontSize: 16, flexShrink: 0 },
  notebookLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sidebarFooter: {
    padding: '12px 16px',
    borderTop: '1px solid var(--ifm-color-emphasis-300)',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderBottom: '1px solid var(--ifm-color-emphasis-300)',
    flexShrink: 0,
  },
  syncBarTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'transparent',
    flexShrink: 0,
    overflow: 'hidden',
  },
  syncBarFill: {
    height: '100%',
    backgroundColor: 'var(--ifm-color-primary)',
    borderRadius: 2,
  },
  noteListBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 24px',
  },
  noteItem: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    border: '1px solid var(--ifm-color-emphasis-200)',
    borderRadius: 8,
    background: 'var(--ifm-background-surface-color)',
    fontSize: 14,
    color: 'var(--ifm-font-color-base)',
    textAlign: 'left',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    overflow: 'hidden',
  },
  noteItemExpanded: {
    borderColor: 'var(--ifm-color-primary)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  noteItemDragging: {
    opacity: 0.4,
  },
  dropSeparator: {
    height: 8,
    position: 'relative',
    flexShrink: 0,
  },
  dropSeparatorLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
    transition: 'background-color 0.1s ease',
    pointerEvents: 'none',
  },
  dropSeparatorLineActive: {
    backgroundColor: 'var(--ifm-color-primary)',
    boxShadow: '0 0 0 1px var(--ifm-color-primary)',
  },
  addAffordance: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 6,
  },
  addBtn: {
    pointerEvents: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--ifm-color-primary)',
    background: 'var(--ifm-background-surface-color)',
    border: '1px solid var(--ifm-color-primary)',
    borderRadius: 14,
    cursor: 'pointer',
    boxShadow: '0 1px 5px rgba(0,0,0,0.14)',
    whiteSpace: 'nowrap',
  },
  draftItem: {
    boxShadow: '0 2px 14px rgba(0,0,0,0.10)',
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: 'default',
  },
  emptyZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    border: '1.5px dashed var(--ifm-color-emphasis-300)',
    borderRadius: 10,
    cursor: 'pointer',
    position: 'relative',
    gap: 0,
  },
  emptyPrompt: {
    position: 'absolute',
    fontSize: 14,
    color: 'var(--ifm-color-emphasis-500)',
    transition: 'opacity 0.12s ease',
  },
  emptyAddBtn: {
    opacity: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 18px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    background: 'var(--ifm-color-primary)',
    border: '1px solid var(--ifm-color-primary)',
    borderRadius: 8,
    cursor: 'pointer',
  },
  tileUpdated: {
    flexShrink: 0,
    marginLeft: 'auto',
    paddingLeft: 12,
    fontSize: 11,
    fontWeight: 400,
    color: 'var(--ifm-color-emphasis-500)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  dragHandle: {
    cursor: 'grab',
    color: 'var(--ifm-color-emphasis-400)',
    fontSize: 16,
    lineHeight: 1,
    flexShrink: 0,
    userSelect: 'none',
    padding: '0 2px',
  },
  tileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 16px',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  tileChevron: {
    fontSize: 12,
    color: 'var(--ifm-color-emphasis-500)',
    flexShrink: 0,
    transition: 'transform 0.18s ease',
    display: 'inline-block',
  },
  tileBody: {
    borderTop: '1px solid var(--ifm-color-emphasis-200)',
    padding: '14px 16px',
    cursor: 'default',
    backgroundColor: 'var(--ifm-background-color)',
  },
  tileToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  tilePreview: {
    lineHeight: 1.7,
    fontSize: 15,
  },
  tileTextarea: {
    minHeight: 220,
    maxHeight: 480,
    flex: 'none',
  },
  noteIcon: { fontSize: 16, flexShrink: 0 },
  noteChevron: { color: 'var(--ifm-color-emphasis-400)', fontSize: 18 },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    opacity: 0,
    padding: '2px 4px',
    borderRadius: 4,
    color: 'var(--ifm-color-emphasis-500)',
    flexShrink: 0,
  },
  editorTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--ifm-color-emphasis-700)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '0 16px',
  },
  btnSeparator: {
    width: 1,
    height: 20,
    backgroundColor: 'var(--ifm-color-emphasis-300)',
    flexShrink: 0,
  },
  btnDanger: {
    backgroundColor: '#e53e3e',
    color: '#fff',
    borderColor: '#e53e3e',
  },
  btnSaved: {
    backgroundColor: 'transparent',
    color: 'var(--ifm-color-emphasis-500)',
    borderColor: 'var(--ifm-color-emphasis-300)',
    cursor: 'default',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    fontSize: 14,
  },
  crumbMuted: {
    color: 'var(--ifm-color-emphasis-500)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 160,
    flexShrink: 0,
  },
  crumbSep: { color: 'var(--ifm-color-emphasis-400)', flexShrink: 0 },
  crumbCurrent: {
    fontWeight: 600,
    color: 'var(--ifm-font-color-base)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  unsavedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 600,
    color: '#b45309',
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderRadius: 10,
    padding: '2px 8px',
  },
  unsavedDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#d97706',
  },
  segmented: {
    display: 'inline-flex',
    border: '1px solid var(--ifm-color-emphasis-300)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  segment: {
    padding: '6px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ifm-color-emphasis-600)',
    lineHeight: 1.4,
  },
  segmentActive: {
    backgroundColor: 'var(--ifm-color-primary)',
    color: '#fff',
  },
  previewTitle: {
    marginTop: 0,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid var(--ifm-color-emphasis-200)',
  },
  editorBody: {
    flex: 1,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  input: {
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid var(--ifm-color-emphasis-300)',
    borderRadius: 6,
    backgroundColor: 'var(--ifm-background-color)',
    color: 'var(--ifm-font-color-base)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  titleInput: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 12,
    border: 'none',
    borderBottom: '2px solid var(--ifm-color-emphasis-200)',
    borderRadius: 0,
    padding: '8px 0',
  },
  textarea: {
    flex: 1,
    padding: '12px',
    fontSize: 14,
    lineHeight: 1.7,
    border: '1px solid var(--ifm-color-emphasis-200)',
    borderRadius: 6,
    backgroundColor: 'var(--ifm-background-color)',
    color: 'var(--ifm-font-color-base)',
    fontFamily: 'var(--ifm-font-family-monospace)',
    resize: 'none',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 200,
  },
  btn: {
    padding: '7px 14px',
    borderRadius: 6,
    border: '1px solid transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.4,
  },
  btnPrimary: {
    backgroundColor: 'var(--ifm-color-primary)',
    color: '#fff',
    borderColor: 'var(--ifm-color-primary)',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    color: 'var(--ifm-color-emphasis-600)',
    borderColor: 'transparent',
  },
  btnOutline: {
    backgroundColor: 'transparent',
    color: 'var(--ifm-color-primary)',
    borderColor: 'var(--ifm-color-primary)',
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--ifm-color-emphasis-700)',
  },
  hint: {
    padding: '12px 16px',
    fontSize: 13,
    color: 'var(--ifm-color-emphasis-500)',
    lineHeight: 1.6,
  },
  statusText: {
    fontSize: 13,
    color: 'var(--ifm-color-emphasis-600)',
  },
  btnToggleOff: {
    backgroundColor: 'transparent',
    color: 'var(--ifm-color-emphasis-600)',
    borderColor: 'var(--ifm-color-emphasis-300)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  btnToggleOn: {
    backgroundColor: 'var(--ifm-color-primary-lightest)',
    color: 'var(--ifm-color-primary-darkest)',
    borderColor: 'var(--ifm-color-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  toggleDot: (active) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: active ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-400)',
    flexShrink: 0,
  }),
  modalOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    backdropFilter: 'blur(2px)',
  },
  modalCard: {
    backgroundColor: 'var(--ifm-background-surface-color)',
    border: '1px solid var(--ifm-color-emphasis-300)',
    borderRadius: 10,
    padding: '24px 28px',
    minWidth: 300,
    maxWidth: 380,
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
  },
  modalProgressTrack: {
    height: 6,
    backgroundColor: 'var(--ifm-color-emphasis-200)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  conflictBanner: {
    padding: '10px 14px',
    backgroundColor: 'rgba(245,158,11,0.12)',
    border: '1px solid rgba(245,158,11,0.5)',
    borderRadius: 6,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 1.5,
    flexShrink: 0,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid var(--ifm-color-emphasis-200)',
  },
  markdownPreview: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    border: '1px solid var(--ifm-color-emphasis-200)',
    borderRadius: 6,
    lineHeight: 1.7,
    fontSize: 15,
  },
  forgetBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px solid var(--ifm-color-emphasis-300)',
    background: 'var(--ifm-background-surface-color)',
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
};
