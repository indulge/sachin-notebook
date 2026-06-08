// Consolidates the note-list's interaction state — expand/collapse, delete
// confirmation, drag-to-reorder, and the hover-to-insert "+ New Note"
// affordance + inline draft — behind a single reducer.
//
// Previously these lived as six separate `useState` hooks in NoteList, each
// reset by hand whenever the notebook changed. Modelling them together makes
// the interactions mutually consistent (starting a drag clears a pending
// hover; opening a draft clears the hover; switching notebooks resets all of
// it) and keeps the component focused on rendering.

import { useEffect, useMemo, useReducer } from 'react';

export interface NoteListState {
  /** Names of expanded note tiles. */
  expanded: Set<string>;
  /** Note name whose delete confirmation is showing, or null. */
  confirmingDelete: string | null;
  /** Note name currently being dragged, or null. */
  dragName: string | null;
  /** Insertion slot (0..N) the drag would drop into, or null. */
  dropIndex: number | null;
  /** Tile index whose "add below" affordance is revealed, or null. */
  hoverIndex: number | null;
  /** Tile index to insert a blank draft after; -1 = top/empty; null = none. */
  draftAfter: number | null;
  /** Persistent "active insertion point" — the gap slot (0..N) a new clip will
   *  stack into, set by clicking a gap. null = no anchor pinned. */
  activeInsert: number | null;
}

type Action =
  | { type: 'reset' }
  | { type: 'toggleExpand'; name: string }
  | { type: 'confirmDelete'; name: string }
  | { type: 'cancelDelete' }
  | { type: 'dragStart'; name: string }
  | { type: 'dragEnd' }
  | { type: 'setDropIndex'; index: number | null }
  | { type: 'setHoverIndex'; index: number | null }
  | { type: 'startDraft'; afterIndex: number }
  | { type: 'closeDraft' }
  | { type: 'setActiveInsert'; slot: number | null };

const INITIAL: NoteListState = {
  expanded: new Set(),
  confirmingDelete: null,
  dragName: null,
  dropIndex: null,
  hoverIndex: null,
  draftAfter: null,
  activeInsert: null,
};

function reducer(state: NoteListState, action: Action): NoteListState {
  switch (action.type) {
    case 'reset':
      return { ...INITIAL, expanded: new Set() };
    case 'toggleExpand': {
      const expanded = new Set(state.expanded);
      if (expanded.has(action.name)) expanded.delete(action.name);
      else expanded.add(action.name);
      return { ...state, expanded };
    }
    case 'confirmDelete':
      return { ...state, confirmingDelete: action.name };
    case 'cancelDelete':
      return { ...state, confirmingDelete: null };
    case 'dragStart':
      // A drag supersedes any hover affordance + pinned anchor.
      return { ...state, dragName: action.name, hoverIndex: null, activeInsert: null };
    case 'dragEnd':
      return { ...state, dragName: null, dropIndex: null };
    case 'setDropIndex':
      return state.dropIndex === action.index ? state : { ...state, dropIndex: action.index };
    case 'setHoverIndex':
      return state.hoverIndex === action.index ? state : { ...state, hoverIndex: action.index };
    case 'startDraft':
      // Opening a draft consumes the anchor — it has served its purpose.
      return { ...state, draftAfter: action.afterIndex, hoverIndex: null, activeInsert: null };
    case 'closeDraft':
      return { ...state, draftAfter: null };
    case 'setActiveInsert':
      return state.activeInsert === action.slot
        ? { ...state, activeInsert: null } // clicking the pinned gap again clears it
        : { ...state, activeInsert: action.slot };
    default:
      return state;
  }
}

export interface NoteListInteractions {
  state: NoteListState;
  hasDraft: boolean;
  dragActive: boolean;
  toggleExpand: (name: string) => void;
  confirmDelete: (name: string) => void;
  cancelDelete: () => void;
  dragStart: (name: string) => void;
  dragEnd: () => void;
  setDropIndex: (index: number | null) => void;
  setHoverIndex: (index: number | null) => void;
  startDraft: (afterIndex: number) => void;
  closeDraft: () => void;
  setActiveInsert: (slot: number | null) => void;
}

export function useNoteListInteractions(notebookName: string): NoteListInteractions {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Collapse and clear everything when switching notebooks.
  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [notebookName]);

  // Stable action creators — never trigger child re-renders by identity churn.
  const actions = useMemo(
    () => ({
      toggleExpand: (name: string) => dispatch({ type: 'toggleExpand', name }),
      confirmDelete: (name: string) => dispatch({ type: 'confirmDelete', name }),
      cancelDelete: () => dispatch({ type: 'cancelDelete' }),
      dragStart: (name: string) => dispatch({ type: 'dragStart', name }),
      dragEnd: () => dispatch({ type: 'dragEnd' }),
      setDropIndex: (index: number | null) => dispatch({ type: 'setDropIndex', index }),
      setHoverIndex: (index: number | null) => dispatch({ type: 'setHoverIndex', index }),
      startDraft: (afterIndex: number) => dispatch({ type: 'startDraft', afterIndex }),
      closeDraft: () => dispatch({ type: 'closeDraft' }),
      setActiveInsert: (slot: number | null) => dispatch({ type: 'setActiveInsert', slot }),
    }),
    [],
  );

  return {
    state,
    hasDraft: state.draftAfter !== null,
    dragActive: state.dragName !== null,
    ...actions,
  };
}
