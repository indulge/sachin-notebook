// The notebook workspace's data + control layer. Owns every piece of state the
// editor needs (notebooks, the selected notebook's notes + metadata, the open
// editor note, loading/sync/modal flags) and exposes typed operations that
// drive the GitHub repo through `GitHubNotebookClient`.
//
// All network I/O is delegated to the service; this hook's job is orchestration
// — sequencing writes, optimistic local updates, the "is it committed yet?"
// sync polling, conflict recovery, and reporting failures via notifications.
// The page component below it stays presentational.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DOCS_PATH, slugify } from '@site/src/lib/notes';
import { GitHubError, GitHubNotebookClient } from '@site/src/services/github';
import { useNotifications } from '@site/src/hooks/useNotifications';
import type {
  EditingNote,
  Notebook,
  NoteContent,
  NoteFile,
  NotebookMetadataState,
  NotebookModalState,
  SaveModalState,
  SyncMode,
} from '@site/src/types';

export type WorkspaceView = 'list' | 'edit' | 'new-notebook';

const EMPTY_METADATA: NotebookMetadataState = { titles: {}, order: [], updated: {}, sha: null };
const CLOSED_SAVE_MODAL: SaveModalState = { open: false, step: 'idle', progress: 0, error: null };
const CLOSED_NOTEBOOK_MODAL: NotebookModalState = { open: false, step: 'idle', error: null };

const errMsg = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

export function useGitHubNotebook(pat: string | null) {
  const { notify } = useNotifications();

  // One client per token. Recreated only when the token changes.
  const client = useMemo(() => new GitHubNotebookClient(pat), [pat]);

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [metadata, setMetadata] = useState<NotebookMetadataState>(EMPTY_METADATA);

  const [view, setView] = useState<WorkspaceView>('list');
  const [editingNote, setEditingNote] = useState<EditingNote | null>(null);

  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingNote, setLoadingNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictBanner, setConflictBanner] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);

  const [saveModal, setSaveModal] = useState<SaveModalState>(CLOSED_SAVE_MODAL);
  const [notebookModal, setNotebookModal] = useState<NotebookModalState>(CLOSED_NOTEBOOK_MODAL);

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    },
    [],
  );

  // ── notebooks / notes / metadata fetching ──────────────────────────────────

  const fetchNotebooks = useCallback(async () => {
    setLoadingNotebooks(true);
    try {
      setNotebooks(await client.listNotebooks());
    } catch (e) {
      notify(errMsg(e, 'Could not load notebooks.'), 'error');
    } finally {
      setLoadingNotebooks(false);
    }
  }, [client, notify]);

  useEffect(() => {
    if (pat) fetchNotebooks();
  }, [pat, fetchNotebooks]);

  const fetchNotes = useCallback(
    async (notebook: Notebook) => {
      setLoadingNotes(true);
      try {
        setNotes(await client.listNotes(notebook.name));
      } catch (e) {
        notify(errMsg(e, 'Could not load notes.'), 'error');
      } finally {
        setLoadingNotes(false);
      }
    },
    [client, notify],
  );

  const fetchMetadata = useCallback(
    async (notebook: Notebook) => {
      setMetadata(await client.getMetadata(notebook.name));
    },
    [client],
  );

  const selectNotebook = useCallback(
    (nb: Notebook) => {
      setSelectedNotebook(nb);
      setView('list');
      setMetadata(EMPTY_METADATA);
      fetchNotes(nb);
      fetchMetadata(nb);
    },
    [fetchNotes, fetchMetadata],
  );

  // ── sync polling (confirm a write landed in the repo listing) ───────────────

  const startSyncPoll = useCallback(
    (fileName: string, notebook: Notebook, mode: SyncMode = 'appeared') => {
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
          const files = await client.listNotes(notebook.name);
          const present = files.some((f) => f.name === fileName);
          const conditionMet = mode === 'appeared' ? present : !present;
          if (conditionMet) {
            if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
            setSyncProgress(100);
            setNotes(files);
            syncTimeoutRef.current = setTimeout(() => setSyncing(false), 600);
            return;
          }
        } catch {
          /* transient — keep polling */
        }
        if (attempts < 8) {
          syncTimeoutRef.current = setTimeout(poll, 2000);
        } else {
          if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
          setSyncing(false);
        }
      };
      syncTimeoutRef.current = setTimeout(poll, 1500);
    },
    [client],
  );

  // ── notebook creation ──────────────────────────────────────────────────────

  const openNewNotebook = useCallback(() => setView('new-notebook'), []);

  const createNotebook = useCallback(
    async (name: string) => {
      const slug = slugify(name);
      setNotebookModal({ open: true, step: 'creating', error: null });

      try {
        await client.createNotebookCategory(slug, name, notebooks.length + 2);
      } catch (e) {
        setNotebookModal({ open: true, step: 'error', error: errMsg(e, 'Unknown error') });
        return;
      }

      // Poll until the new folder shows up in the notebooks listing.
      setNotebookModal({ open: true, step: 'syncing', error: null });
      let attempts = 0;
      const poll = async () => {
        attempts++;
        try {
          const all = await client.listNotebooks();
          const created = all.find((nb) => nb.name === slug);
          if (created) {
            setNotebooks(all);
            setSelectedNotebook(created);
            setView('list');
            setMetadata(EMPTY_METADATA);
            fetchNotes(created);
            fetchMetadata(created);
            setNotebookModal({ open: true, step: 'done', error: null });
            setTimeout(() => setNotebookModal(CLOSED_NOTEBOOK_MODAL), 1200);
            return;
          }
        } catch {
          /* transient — keep polling */
        }
        if (attempts < 12) setTimeout(poll, 2000);
        else setNotebookModal(CLOSED_NOTEBOOK_MODAL); // timed out; user can refresh
      };
      setTimeout(poll, 1500);
    },
    [client, notebooks.length, fetchNotes, fetchMetadata],
  );

  // ── deletion ─────────────────────────────────────────────────────────────

  const deleteNote = useCallback(
    async (note: NoteFile) => {
      if (!selectedNotebook) return;
      if (!note.sha) {
        notify('Cannot delete: missing file SHA. Refresh and try again.', 'error');
        return;
      }
      try {
        await client.deleteFile(
          `${DOCS_PATH}/${selectedNotebook.name}/${note.name}`,
          note.sha,
          `Delete note: ${note.name}`,
        );
        const newTitles = { ...metadata.titles };
        delete newTitles[note.name];
        const newUpdated = { ...metadata.updated };
        delete newUpdated[note.name];
        const newOrder = metadata.order.filter((n) => n !== note.name);
        const newSha = await client.putMetadata(
          selectedNotebook.name,
          newTitles,
          newOrder,
          newUpdated,
          metadata.sha,
        );
        setMetadata({ titles: newTitles, order: newOrder, updated: newUpdated, sha: newSha });
        startSyncPoll(note.name, selectedNotebook, 'gone');
        notify('Note deleted.', 'success');
      } catch (e) {
        notify(errMsg(e, 'Delete failed.'), 'error');
      }
    },
    [client, selectedNotebook, metadata, startSyncPoll, notify],
  );

  // ── refresh everything currently on screen ──────────────────────────────────

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setRefreshProgress(0);
    let prog = 0;
    const tick = setInterval(() => {
      prog = Math.min(prog + 3, 85);
      setRefreshProgress(prog);
    }, 80);

    fetchNotebooks();

    let freshTitles: Record<string, string> = {};
    if (selectedNotebook) {
      fetchNotes(selectedNotebook);
      const meta = await client.getMetadata(selectedNotebook.name);
      freshTitles = meta.titles;
      setMetadata(meta);
    }

    if (view === 'edit' && editingNote) {
      try {
        const { content, sha } = await client.getFileByPath(editingNote.path);
        const fileName = editingNote.path.split('/').pop() ?? '';
        const title = freshTitles[fileName] || editingNote.title;
        setEditingNote((prev) =>
          prev ? { ...prev, sha, content, title, _refreshKey: (prev._refreshKey || 0) + 1 } : null,
        );
      } catch {
        /* leave the open note as-is on a refresh failure */
      }
    }

    clearInterval(tick);
    setRefreshProgress(100);
    setTimeout(() => {
      setRefreshing(false);
      setRefreshProgress(0);
    }, 500);
  }, [client, fetchNotebooks, fetchNotes, selectedNotebook, view, editingNote]);

  // ── full-screen editor: open ────────────────────────────────────────────────

  const openNewNote = useCallback(() => {
    setEditingNote(null);
    setView('edit');
  }, []);

  const openNote = useCallback(
    async (note: NoteFile) => {
      if (!selectedNotebook || loadingNote) return;
      setLoadingNote(note.name);
      try {
        const { content, sha } = await client.getNote(selectedNotebook.name, note.name);
        setEditingNote({
          path: `${DOCS_PATH}/${selectedNotebook.name}/${note.name}`,
          sha,
          title: metadata.titles[note.name] || '',
          content,
        });
        setView('edit');
      } catch (e) {
        notify(errMsg(e, 'Failed to load note.'), 'error');
      } finally {
        setLoadingNote(null);
      }
    },
    [client, selectedNotebook, loadingNote, metadata.titles, notify],
  );

  // ── inline (Jupyter-style) tile load + save ──────────────────────────────────

  const loadNoteContent = useCallback(
    (note: NoteFile): Promise<NoteContent> => {
      if (!selectedNotebook) return Promise.reject(new Error('No notebook selected.'));
      return client.getNote(selectedNotebook.name, note.name);
    },
    [client, selectedNotebook],
  );

  /** Persist title+order+updated for a note after a successful body write. */
  const commitMetadata = useCallback(
    async (fileName: string, noteTitle: string) => {
      if (!selectedNotebook) return;
      const newTitles = { ...metadata.titles, [fileName]: noteTitle };
      const newOrder = metadata.order.includes(fileName)
        ? metadata.order
        : [...metadata.order, fileName];
      const newUpdated = { ...metadata.updated, [fileName]: Date.now() };
      const newSha = await client.putMetadata(
        selectedNotebook.name,
        newTitles,
        newOrder,
        newUpdated,
        metadata.sha,
      );
      setMetadata({ titles: newTitles, order: newOrder, updated: newUpdated, sha: newSha });
    },
    [client, selectedNotebook, metadata],
  );

  const saveNoteContent = useCallback(
    async (note: NoteFile, title: string, content: string, sha: string | null) => {
      if (!selectedNotebook) throw new Error('No notebook selected.');
      const noteTitle = title.trim() || 'untitled';
      const newSha = await client.putFile(
        `${DOCS_PATH}/${selectedNotebook.name}/${note.name}`,
        `Update: ${noteTitle}`,
        content,
        sha,
      );
      await commitMetadata(note.name, noteTitle);
      return newSha;
    },
    [client, selectedNotebook, commitMetadata],
  );

  const reorderNotes = useCallback(
    async (newOrder: string[]) => {
      if (!selectedNotebook) return;
      setMetadata((prev) => ({ ...prev, order: newOrder })); // optimistic
      try {
        const newSha = await client.putMetadata(
          selectedNotebook.name,
          metadata.titles,
          newOrder,
          metadata.updated,
          metadata.sha,
        );
        setMetadata((prev) => ({ ...prev, order: newOrder, sha: newSha }));
      } catch (e) {
        notify(errMsg(e, 'Could not save the new order.'), 'error');
      }
    },
    [client, selectedNotebook, metadata, notify],
  );

  const createNoteInline = useCallback(
    async (preceding: string[], following: string[], title: string, content: string) => {
      if (!selectedNotebook) throw new Error('No notebook selected.');
      const noteTitle = title.trim() || 'untitled';
      const fileName = `${slugify(noteTitle)}-${Date.now()}.md`;
      const filePath = `${DOCS_PATH}/${selectedNotebook.name}/${fileName}`;
      const newSha = await client.putFile(filePath, `Create note: ${noteTitle}`, content);

      const newOrder = [...preceding, fileName, ...following];
      const newTitles = { ...metadata.titles, [fileName]: noteTitle };
      const newUpdated = { ...metadata.updated, [fileName]: Date.now() };
      const newMetaSha = await client.putMetadata(
        selectedNotebook.name,
        newTitles,
        newOrder,
        newUpdated,
        metadata.sha,
      );
      setMetadata({ titles: newTitles, order: newOrder, updated: newUpdated, sha: newMetaSha });

      setNotes((prev) =>
        prev.some((n) => n.name === fileName)
          ? prev
          : [...prev, { name: fileName, sha: newSha, type: 'file', path: filePath }],
      );
      notify('Note created.', 'success');
    },
    [client, selectedNotebook, metadata, notify],
  );

  // ── full-screen editor: save (modal + conflict recovery + sync poll) ─────────

  const saveNote = useCallback(
    async (title: string, content: string) => {
      if (!selectedNotebook) return;
      setConflictBanner(false);
      setSaving(true);

      const noteTitle = title.trim() || 'untitled';
      const fileName = editingNote
        ? (editingNote.path.split('/').pop() ?? '')
        : `${slugify(noteTitle)}-${Date.now()}.md`;
      const filePath = editingNote
        ? editingNote.path
        : `${DOCS_PATH}/${selectedNotebook.name}/${fileName}`;

      // Phase 1: push.
      setSaveModal({ open: true, step: 'pushing', progress: 5, error: null });
      let pushProg = 5;
      const pushTick = setInterval(() => {
        pushProg = Math.min(pushProg + 4, 45);
        setSaveModal((prev) => ({ ...prev, progress: pushProg }));
      }, 80);

      let expectedSha: string | null;
      try {
        expectedSha = await client.putFile(
          filePath,
          editingNote ? `Update: ${noteTitle}` : `Create note: ${noteTitle}`,
          content,
          editingNote?.sha,
        );
      } catch (e) {
        clearInterval(pushTick);
        if (e instanceof GitHubError && e.isConflict) {
          // Reload the latest SHA, keep the user's edits, and let them retry.
          setSaveModal(CLOSED_SAVE_MODAL);
          try {
            const latest = await client.getFileByPath(filePath);
            setEditingNote((prev) =>
              prev
                ? { ...prev, sha: latest.sha }
                : { path: filePath, sha: latest.sha, title, content },
            );
          } catch {
            /* best-effort SHA refresh */
          }
          setConflictBanner(true);
          notify('Merge conflict — reloaded the latest version. Review and save again.', 'error');
          setSaving(false);
          return;
        }
        const message = errMsg(e, 'Unknown error');
        setSaveModal({ open: true, step: 'error', progress: 0, error: message });
        notify(message, 'error');
        setSaving(false);
        return;
      }
      clearInterval(pushTick);

      // Push succeeded: re-baseline the editor and persist metadata.
      setEditingNote((prev) =>
        prev
          ? { ...prev, sha: expectedSha, title, content }
          : { path: filePath, sha: expectedSha, title, content },
      );
      await commitMetadata(fileName, noteTitle);

      // Phase 2: poll the file until its SHA matches what we just wrote.
      setSaveModal({ open: true, step: 'syncing', progress: 50, error: null });
      let syncProg = 50;
      const syncTick = setInterval(() => {
        syncProg = Math.min(syncProg + 1, 90);
        setSaveModal((prev) => ({ ...prev, progress: syncProg }));
      }, 150);

      const finish = async () => {
        clearInterval(syncTick);
        try {
          setNotes(await client.listNotes(selectedNotebook.name));
        } catch {
          /* listing refresh is best-effort */
        }
        setSaveModal({ open: true, step: 'done', progress: 100, error: null });
        setTimeout(() => setSaveModal(CLOSED_SAVE_MODAL), 1000);
        setSaving(false);
      };

      let attempts = 0;
      const poll = async () => {
        attempts++;
        try {
          const latest = await client.getFileByPath(filePath);
          if (!expectedSha || latest.sha === expectedSha) {
            await finish();
            return;
          }
        } catch {
          /* transient — keep polling */
        }
        if (attempts < 12) setTimeout(poll, 2000);
        else await finish();
      };
      setTimeout(poll, 1500);
    },
    [client, selectedNotebook, editingNote, commitMetadata, notify],
  );

  // ── view helpers ────────────────────────────────────────────────────────────

  const showList = useCallback(() => setView('list'), []);
  const clearConflict = useCallback(() => setConflictBanner(false), []);
  const closeSaveModal = useCallback(() => setSaveModal(CLOSED_SAVE_MODAL), []);
  const closeNotebookModal = useCallback(() => setNotebookModal(CLOSED_NOTEBOOK_MODAL), []);

  return {
    // state
    notebooks,
    selectedNotebook,
    notes,
    metadata,
    view,
    editingNote,
    loadingNotebooks,
    loadingNotes,
    loadingNote,
    saving,
    conflictBanner,
    syncing,
    syncProgress,
    refreshing,
    refreshProgress,
    saveModal,
    notebookModal,
    // operations
    fetchNotebooks,
    selectNotebook,
    openNewNotebook,
    createNotebook,
    deleteNote,
    refreshAll,
    openNewNote,
    openNote,
    loadNoteContent,
    saveNoteContent,
    reorderNotes,
    createNoteInline,
    saveNote,
    showList,
    clearConflict,
    closeSaveModal,
    closeNotebookModal,
  };
}

export type UseGitHubNotebook = ReturnType<typeof useGitHubNotebook>;
