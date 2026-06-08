// The notebook workspace page.
//
// This component is intentionally thin: all data + control logic lives in the
// `useGitHubNotebook` hook (which talks to the GitHub service), all network
// failures surface through the `NotificationProvider`, and every render-time
// throw is caught by `ErrorBoundary`. The page's only local concern is the
// auth token: holding it, hydrating it from localStorage, and toggling the
// token dialog. Everything else is presentational wiring.

import React, { useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import ErrorBoundary from '@site/src/components/ErrorBoundary';
import EmptyState from '@site/src/components/notebook/EmptyState';
import NewNotebookPanel from '@site/src/components/notebook/NewNotebookPanel';
import NoteEditor from '@site/src/components/notebook/NoteEditor';
import MiniNotebookGrid from '@site/src/components/notebook/MiniNotebookGrid';
import NoteList from '@site/src/components/notebook/NoteList';
import NotebookModal from '@site/src/components/notebook/NotebookModal';
import SaveModal from '@site/src/components/notebook/SaveModal';
import Sidebar from '@site/src/components/notebook/Sidebar';
import SyncDock from '@site/src/components/notebook/SyncDock';
import TokenGate from '@site/src/components/notebook/TokenGate';
import { s } from '@site/src/components/notebook/styles';
import { NotificationProvider } from '@site/src/hooks/useNotifications';
import { useGitHubNotebook } from '@site/src/hooks/useGitHubNotebook';

function Workspace() {
  // The auth token is the page's only owned state. `null` until hydrated.
  const [pat, setPat] = useState<string | null>(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('gh_pat') : null;
    if (saved) setPat(saved);
  }, []);

  const nb = useGitHubNotebook(pat);

  const forgetToken = () => {
    localStorage.removeItem('gh_pat');
    setPat(null);
    setShowTokenDialog(false);
  };

  if (!pat && !showTokenDialog) {
    return <TokenGate onAuthenticated={setPat} />;
  }

  if (showTokenDialog) {
    return (
      <TokenGate
        onAuthenticated={(token) => {
          forgetToken();
          setPat(token);
          setShowTokenDialog(false);
        }}
        onDismiss={() => setShowTokenDialog(false)}
      />
    );
  }

  return (
    <div style={s.workspace}>
      {(nb.refreshing || nb.refreshProgress > 0) && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 100,
            backgroundColor: 'var(--ifm-color-emphasis-200)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${nb.refreshProgress}%`,
              backgroundColor: 'var(--ifm-color-primary)',
              transition: nb.refreshProgress < 100 ? 'width 0.12s ease' : 'width 0.3s ease',
            }}
          />
        </div>
      )}
      <Sidebar
        notebooks={nb.notebooks}
        selected={nb.selectedNotebook}
        onSelect={nb.selectNotebook}
        onNewNotebook={nb.openNewNotebook}
        loading={nb.loadingNotebooks}
        onRefresh={nb.refreshAll}
        refreshing={nb.refreshing}
      />
      <main style={s.main}>
        {nb.view === 'new-notebook' && (
          <NewNotebookPanel
            onCreate={nb.createNotebook}
            onCancel={nb.showList}
            saving={nb.notebookModal.open}
          />
        )}
        {nb.view === 'edit' && (
          <ErrorBoundary label="the editor">
            <NoteEditor
              key={
                nb.editingNote
                  ? `${nb.editingNote.path}-${nb.editingNote._refreshKey ?? 0}`
                  : 'new'
              }
              onBack={nb.showList}
              onSave={nb.saveNote}
              notebookName={nb.selectedNotebook?.name ?? ''}
              initialTitle={nb.editingNote?.title ?? ''}
              initialContent={nb.editingNote?.content ?? ''}
              saving={nb.saving}
              conflictBanner={nb.conflictBanner}
              onClearConflict={nb.clearConflict}
            />
          </ErrorBoundary>
        )}
        {nb.view === 'list' && nb.selectedNotebook && (
          <ErrorBoundary label="this notebook">
            <NoteList
              notebook={nb.selectedNotebook}
              notes={nb.notes}
              loading={nb.loadingNotes}
              onDeleteNote={nb.deleteNote}
              metadata={nb.metadata}
              onLoadNote={nb.loadNoteContent}
              onSaveNote={nb.saveNoteContent}
              onReorder={nb.reorderNotes}
              onCreateNote={nb.createNoteInline}
              syncing={nb.syncing}
              syncProgress={nb.syncProgress}
            />
          </ErrorBoundary>
        )}
        {nb.view === 'list' && !nb.selectedNotebook && <EmptyState />}
      </main>
      {nb.saveModal.open && (
        <SaveModal
          step={nb.saveModal.step}
          progress={nb.saveModal.progress}
          error={nb.saveModal.error}
          onClose={nb.closeSaveModal}
        />
      )}
      {nb.notebookModal.open && (
        <NotebookModal
          step={nb.notebookModal.step}
          error={nb.notebookModal.error}
          onClose={nb.closeNotebookModal}
        />
      )}
      {nb.selectedNotebook && (
        <MiniNotebookGrid
          notebookName={nb.selectedNotebook.name}
          notes={nb.notes}
          metadata={nb.metadata}
          onOpenNote={nb.openNote}
        />
      )}
      <SyncDock saving={nb.saving} syncing={nb.syncing} refreshing={nb.refreshing} />
      <button onClick={() => setShowTokenDialog(true)} style={s.forgetBtn} title="Change GitHub token">
        🔑
      </button>
    </div>
  );
}

export default function NotebookPage() {
  return (
    <Layout title="Notebook" description="Write notes">
      {/* The provider must wrap Workspace: useGitHubNotebook reports via useNotifications. */}
      <NotificationProvider>
        <ErrorBoundary label="the notebook">
          <Workspace />
        </ErrorBoundary>
      </NotificationProvider>
    </Layout>
  );
}
