// A blank, unsaved note edited inline (the hover-to-insert "+ New Note" tile).
// On a successful save the parent unmounts it, so save state never settles back
// here — `begin`/`fail` is enough; success is the parent's responsibility.

import React, { useEffect, useRef, useState } from 'react';
import { useSaveLifecycle } from '@site/src/hooks/useSaveLifecycle';
import MarkdownPreview from './MarkdownPreview';
import { s } from './styles';

interface Props {
  onSave: (title: string, content: string) => Promise<void>;
  onDiscard: () => void;
}

export default function DraftNote({ onSave, onDiscard }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [renderMode, setRenderMode] = useState(false);
  const save = useSaveLifecycle();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const canSave = !!(title.trim() || content.trim());

  const handleSave = async () => {
    if (!canSave || save.saving) return;
    save.begin();
    try {
      await onSave(title, content);
      // On success the parent unmounts this draft — don't touch state after.
    } catch (err: unknown) {
      save.fail(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  return (
    <div className="note-draft-tile" style={{ ...s.noteItem, ...s.noteItemExpanded, ...s.draftItem }}>
      <div style={s.tileHeader}>
        <span style={s.noteIcon}>📝</span>
        <span style={{ flex: 1, fontWeight: 600, color: 'var(--ifm-color-primary)' }}>New note</span>
        <button onClick={onDiscard} style={{ ...s.btn, ...s.btnGhost }} disabled={save.saving}>
          Discard
        </button>
      </div>
      <div style={s.tileBody}>
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
              disabled={save.saving || !canSave}
              style={{ ...s.btn, ...(canSave ? s.btnPrimary : s.btnSaved) }}
            >
              {save.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {renderMode ? (
          <MarkdownPreview title={title} content={content} wrapperStyle={s.tilePreview} />
        ) : (
          <>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
      </div>
    </div>
  );
}
