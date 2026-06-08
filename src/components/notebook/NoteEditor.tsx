// Full-screen single-note editor with edit/preview, dirty tracking, Ctrl/Cmd-S
// save, and inline merge-conflict recovery. Pure UI — the actual save (and its
// modal/sync orchestration) is owned by the parent via `onSave`.

import React, { useEffect, useRef, useState } from 'react';
import MarkdownPreview from './MarkdownPreview';
import { s } from './styles';

interface Props {
  onBack: () => void;
  onSave: (title: string, content: string) => void;
  notebookName?: string;
  initialTitle?: string;
  initialContent?: string;
  saving: boolean;
  conflictBanner: boolean;
  onClearConflict: () => void;
}

export default function NoteEditor({
  onBack,
  onSave,
  notebookName = '',
  initialTitle = '',
  initialContent = '',
  saving,
  conflictBanner,
  onClearConflict,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [renderMode, setRenderMode] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    const handler = (e: KeyboardEvent) => {
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
          <button onClick={handleExit} style={{ ...s.btn, ...s.btnGhost, flexShrink: 0 }}>
            ← Notes
          </button>
          <div style={s.breadcrumb}>
            {notebookName && (
              <>
                <span style={s.crumbMuted}>{notebookName}</span>
                <span style={s.crumbSep}>›</span>
              </>
            )}
            <span style={s.crumbCurrent}>{title.trim() || 'Untitled'}</span>
            {isDirty && (
              <span style={s.unsavedBadge}>
                <span style={s.unsavedDot} />
                unsaved
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {discardConfirm ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--ifm-color-emphasis-600)' }}>
                Discard unsaved changes?
              </span>
              <button
                onClick={onBack}
                style={{ ...s.btn, ...s.btnDanger, padding: '3px 10px', fontSize: 12 }}
              >
                Discard
              </button>
              <button
                onClick={() => setDiscardConfirm(false)}
                style={{ ...s.btn, ...s.btnGhost, padding: '3px 10px', fontSize: 12 }}
              >
                Keep editing
              </button>
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
            <span>
              ⚠️ Merge conflict detected. The file was updated remotely. The latest SHA has been
              loaded and your edits are preserved — review and save again.
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => onSave(title, content)}
                style={{ ...s.btn, ...s.btnPrimary, fontSize: 12, padding: '4px 10px' }}
              >
                Retry Save
              </button>
              <button
                onClick={onClearConflict}
                style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '4px 10px' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {renderMode ? (
          <MarkdownPreview
            title={title}
            content={content}
            headingLevel="h1"
            wrapperStyle={s.markdownPreview}
          />
        ) : (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              style={{ ...s.input, ...s.titleInput }}
            />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note in Markdown…"
              style={s.textarea}
            />
          </>
        )}
      </div>
    </div>
  );
}
