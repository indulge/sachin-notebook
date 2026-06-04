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

function Sidebar({ notebooks, selected, onSelect, onNewNotebook, loading }) {
  return (
    <aside style={s.sidebar}>
      <div style={s.sidebarHeader}>My Notebooks</div>
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

// ── Note list ───────────────────────────────────────────────────────────────

function NoteList({ notebook, notes, loading, onNewNote, onOpenNote, onDeleteNote, syncing, syncProgress }) {
  const [confirmingDelete, setConfirmingDelete] = useState(null);

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
        <button onClick={onNewNote} style={{ ...s.btn, ...s.btnPrimary }}>+ New Note</button>
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
        {!loading && notes.length === 0 && (
          <div style={s.hint}>No notes yet. Create your first one.</div>
        )}
        {notes.map(note => (
          <div key={note.name} style={s.noteItem} className="note-item-row">
            <span style={s.noteIcon}>📄</span>
            <span
              onClick={() => onOpenNote(note)}
              style={{ flex: 1, cursor: 'pointer' }}
            >
              {note.name.replace(/\.mdx?$/, '')}
            </span>
            {confirmingDelete === note.name ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Delete?</span>
                <button onClick={e => handleConfirmDelete(e, note)} style={{ ...s.btn, ...s.btnDanger, padding: '3px 8px' }}>Yes</button>
                <button onClick={handleCancelDelete} style={{ ...s.btn, ...s.btnGhost, padding: '3px 8px' }}>No</button>
              </span>
            ) : (
              <button onClick={e => handleDeleteClick(e, note)} style={s.deleteBtn} className="note-delete-btn" title="Delete note">
                🗑
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Note editor ─────────────────────────────────────────────────────────────

function NoteEditor({ onBack, onSave, initialContent = '', saving, status, conflictBanner, onClearConflict }) {
  const [content, setContent] = useState(initialContent);
  const [renderMode, setRenderMode] = useState(false);
  const textareaRef = useRef(null);


  useEffect(() => {
    if (!renderMode && textareaRef.current) textareaRef.current.focus();
  }, [renderMode]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saving) onSave(content);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [content, saving, onSave]);


  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <button onClick={onBack} style={{ ...s.btn, ...s.btnGhost }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setRenderMode(m => !m)}
            style={{ ...s.btn, ...(renderMode ? s.btnToggleOn : s.btnToggleOff) }}
          >
            <span style={s.toggleDot(renderMode)} />
            Render Markdown
          </button>
          <span style={s.btnSeparator} />
          <button onClick={onBack} style={{ ...s.btn, ...s.btnGhost }}>Close Note</button>
          <span style={s.btnSeparator} />
          <button
            onClick={() => onSave(content)}
            disabled={saving}
            style={{ ...s.btn, ...s.btnPrimary }}
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
      <div style={s.editorBody}>
        {conflictBanner && (
          <div style={s.conflictBanner}>
            <span>⚠️ Merge conflict detected. The file was updated remotely. The latest SHA has been loaded and your edits are preserved — review and save again.</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => onSave(content)} style={{ ...s.btn, ...s.btnPrimary, fontSize: 12, padding: '4px 10px' }}>
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
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              );
            }}
          </BrowserOnly>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your note in Markdown…"
            style={s.textarea}
          />
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
          This will create a folder <code>docs/{slugify(name || 'notebook-name')}/</code> in your repository.
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
      const res = await fetch(`${API}/${DOCS_PATH}`, { headers: authHeaders() });
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
      const res = await fetch(`${API}/${DOCS_PATH}/${notebook.name}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.filter(i => i.type === 'file' && /\.mdx?$/.test(i.name) && !i.name.startsWith('_')));
      }
    } catch { /* network error */ }
    setLoadingNotes(false);
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
    fetchNotes(nb);
  };

  const handleNewNotebook = () => { setView('new-notebook'); setStatus(''); };

  const createNotebook = async (name) => {
    const slug = slugify(name);
    const catJson = JSON.stringify({ label: name, position: notebooks.length + 2 }, null, 2);
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(`${API}/${DOCS_PATH}/${slug}/_category_.json`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          message: `Create notebook: ${name}`,
          content: b64Encode(catJson),
          branch: BRANCH,
        }),
      });
      if (res.ok) {
        await fetchNotebooks();
        setView('list');
        setSelectedNotebook(null);
      } else {
        const err = await res.json();
        setStatus(`Error: ${err.message}`);
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
    setSaving(false);
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
        startSyncPoll(note.name, selectedNotebook, 'gone');
      } else {
        const err = await res.json();
        setStatus(`Error: ${err.message}`);
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const openNewNote = () => {
    setEditingNote(null);
    setView('edit');
    setStatus('');
  };

  const openNote = async (note) => {
    setStatus('');
    try {
      const res = await fetch(note.url, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const raw = b64Decode(data.content);
        // Strip frontmatter (backwards compat with old saved notes)
        const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
        const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
        // Strip leading '# ' from first line (backwards compat with old h1 title format)
        const content = body.replace(/^# /, '').trimStart();
        setEditingNote({ path: `${DOCS_PATH}/${selectedNotebook.name}/${note.name}`, sha: data.sha, content });
        setView('edit');
      }
    } catch (e) {
      setStatus(`Error loading note: ${e.message}`);
    }
  };

  const saveNote = async (content) => {
    setConflictBanner(false);
    setSaving(true);

    const title = content.split('\n')[0].trim() || 'untitled';
    const fileName = editingNote ? editingNote.path.split('/').pop() : `${slugify(title)}.md`;
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
        message: editingNote ? `Update: ${title}` : `Create note: ${title}`,
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
          setEditingNote(prev => prev ? { ...prev, sha: data.sha } : { path: filePath, sha: data.sha, content });
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

    // Push succeeded — update SHA for next save
    try {
      const resData = await res.json();
      if (resData.content?.sha) {
        setEditingNote(prev => prev ? { ...prev, sha: resData.content.sha } : null);
      }
    } catch {}

    // ── Phase 2: poll until repo reflects the change ───────────────────────
    setSaveModal({ open: true, step: 'syncing', progress: 50, error: null });
    let syncProg = 50;
    const syncTick = setInterval(() => {
      syncProg = Math.min(syncProg + 1, 90);
      setSaveModal(prev => ({ ...prev, progress: syncProg }));
    }, 150);

    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const r = await fetch(
          `${API}/${DOCS_PATH}/${selectedNotebook.name}?ref=${BRANCH}&_=${Date.now()}`,
          { headers: authHeaders() }
        );
        if (r.ok) {
          const files = (await r.json()).filter(
            i => i.type === 'file' && /\.mdx?$/.test(i.name) && !i.name.startsWith('_')
          );
          if (files.some(f => f.name === fileName)) {
            clearInterval(syncTick);
            setNotes(files);
            setSaveModal({ open: true, step: 'done', progress: 100, error: null });
            setTimeout(() => setSaveModal({ open: false, step: 'idle', progress: 0, error: null }), 1000);
            setSaving(false);
            return;
          }
        }
      } catch {}
      if (attempts < 10) { setTimeout(poll, 1500); }
      else {
        clearInterval(syncTick);
        setSaveModal({ open: true, step: 'done', progress: 100, error: null });
        setTimeout(() => setSaveModal({ open: false, step: 'idle', progress: 0, error: null }), 1000);
        setSaving(false);
      }
    };
    setTimeout(poll, 1000);
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
        <Sidebar
          notebooks={notebooks}
          selected={selectedNotebook}
          onSelect={selectNotebook}
          onNewNotebook={handleNewNotebook}
          loading={loadingNotebooks}
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
              key={editingNote?.path ?? 'new'}
              onBack={() => setView('list')}
              onSave={saveNote}
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
              onNewNote={openNewNote}
              onOpenNote={openNote}
              onDeleteNote={deleteNote}
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
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 16px',
    marginBottom: 8,
    border: '1px solid var(--ifm-color-emphasis-200)',
    borderRadius: 8,
    background: 'var(--ifm-background-surface-color)',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--ifm-font-color-base)',
    textAlign: 'left',
    transition: 'border-color 0.15s',
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
