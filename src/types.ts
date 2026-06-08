// Central type definitions for the Write app (the GitHub-backed notebook editor).
//
// Grouped into three concerns:
//   1. GitHub Contents API request/response shapes
//   2. Domain models (notebooks, notes, per-notebook metadata)
//   3. UI / editor lifecycle state (draft → saving → committed → error)
//
// The pure runtime helpers live in `src/lib/notes.js`, which stays JavaScript
// because it is also imported by the Node build chain (sidebars.js, the
// notebook-snapshot plugin) where `.ts` cannot be resolved. These interfaces
// describe the same data shapes that module produces and consumes.

// ── 1. GitHub Contents API ───────────────────────────────────────────────────

/** A single entry returned when listing a directory via the Contents API. */
export interface GitHubContentEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
}

/** Response of GET on a single file (`content` is base64-encoded). */
export interface GitHubFileResponse {
  name: string;
  path: string;
  sha: string;
  content: string;
  encoding: string;
}

/** Body of a PUT (create/update) request against the Contents API. */
export interface GitHubPutRequest {
  message: string;
  /** base64-encoded file content. */
  content: string;
  branch: string;
  /** Required when updating an existing file; omitted when creating. */
  sha?: string;
}

/** Body of a DELETE request against the Contents API. */
export interface GitHubDeleteRequest {
  message: string;
  sha: string;
  branch: string;
}

/** Response of a successful PUT — `content.sha` is the new blob SHA. */
export interface GitHubWriteResponse {
  content: { sha: string; path: string; name: string } | null;
  commit: { sha: string };
}

/** Error envelope GitHub returns for 4xx/5xx responses. */
export interface GitHubErrorResponse {
  message: string;
  documentation_url?: string;
}

// ── 2. Domain models ─────────────────────────────────────────────────────────

/** A notebook is a directory under `docs/`. */
export interface Notebook {
  name: string;
}

/** A note file (`*.md`/`*.mdx`) inside a notebook directory. */
export interface NoteFile {
  name: string;
  sha: string | null;
  type: 'file';
  path: string;
}

/**
 * Parsed `_metadata.json` payload: human titles, the user-defined display
 * order, and last-updated timestamps (epoch millis) keyed by file name.
 */
export interface NoteMetadata {
  titles: Record<string, string>;
  order: string[];
  updated: Record<string, number>;
}

/** Metadata plus the blob SHA needed to commit the next update to it. */
export interface NotebookMetadataState extends NoteMetadata {
  sha: string | null;
}

/** A note's body together with the SHA required to update it. */
export interface NoteContent {
  content: string;
  sha: string | null;
}

// ── 3. UI / editor lifecycle ─────────────────────────────────────────────────

/** Lifecycle of an editable note: a clean state machine for the UI to render. */
export type NoteLifecycle = 'idle' | 'draft' | 'saving' | 'committed' | 'error';

/** The note currently open in the full-screen editor. */
export interface EditingNote {
  path: string;
  sha: string | null;
  title: string;
  content: string;
  /** Bumped to force the editor to re-seed after a remote refresh. */
  _refreshKey?: number;
}

export type SaveModalStep = 'idle' | 'pushing' | 'syncing' | 'done' | 'error';
export type NotebookModalStep = 'idle' | 'creating' | 'syncing' | 'done' | 'error';

export interface SaveModalState {
  open: boolean;
  step: SaveModalStep;
  progress: number;
  error: string | null;
}

export interface NotebookModalState {
  open: boolean;
  step: NotebookModalStep;
  error: string | null;
}

/** Whether a sync poll waits for a file to appear or to disappear. */
export type SyncMode = 'appeared' | 'gone';

/** A transient, user-facing notification (toast). */
export interface AppNotification {
  id: number;
  kind: 'error' | 'success' | 'info';
  message: string;
}
