// A small, explicit state machine for one note's save lifecycle:
//
//   idle ──begin──▶ saving ──succeed──▶ committed ──(1.5s)──▶ idle
//                      │
//                      └──fail──▶ error ──begin/reset──▶ …
//
// Replaces the ad-hoc `saving` / `saveError` / `justSaved` useState trio that
// the draft and expandable-note tiles each carried, so the three flags can
// never drift into an impossible combination (e.g. "saving" and "error" at
// once). Consumed by DraftNote and ExpandableNote.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { NoteLifecycle } from '@site/src/types';

interface State {
  status: NoteLifecycle;
  error: string | null;
}

type Action =
  | { type: 'begin' }
  | { type: 'succeed' }
  | { type: 'fail'; error: string }
  | { type: 'reset' };

const INITIAL: State = { status: 'idle', error: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'begin':
      return { status: 'saving', error: null };
    case 'succeed':
      return { status: 'committed', error: null };
    case 'fail':
      return { status: 'error', error: action.error };
    case 'reset':
      return INITIAL;
    default:
      return state;
  }
}

export interface SaveLifecycle {
  status: NoteLifecycle;
  error: string | null;
  saving: boolean;
  justSaved: boolean;
  begin: () => void;
  succeed: () => void;
  fail: (error: string) => void;
  reset: () => void;
}

const FLASH_MS = 1500;

export function useSaveLifecycle(): SaveLifecycle {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlash = () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = null;
  };

  useEffect(() => clearFlash, []);

  const begin = useCallback(() => {
    clearFlash();
    dispatch({ type: 'begin' });
  }, []);

  // Flash the "saved" confirmation, then settle back to idle.
  const succeed = useCallback(() => {
    dispatch({ type: 'succeed' });
    clearFlash();
    flashTimer.current = setTimeout(() => dispatch({ type: 'reset' }), FLASH_MS);
  }, []);

  const fail = useCallback((error: string) => {
    clearFlash();
    dispatch({ type: 'fail', error });
  }, []);

  const reset = useCallback(() => {
    clearFlash();
    dispatch({ type: 'reset' });
  }, []);

  return {
    status: state.status,
    error: state.error,
    saving: state.status === 'saving',
    justSaved: state.status === 'committed',
    begin,
    succeed,
    fail,
    reset,
  };
}
