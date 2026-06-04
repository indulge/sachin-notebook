# Build a Git-Backed Notebook on a Static Site

A complete reference for building a browser-only notebook where notes are Markdown files stored in a GitHub repository. No server, no backend, no build step on write. Designed to be read by an AI implementing a similar module from scratch.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Docusaurus 3 (React) |
| Storage | GitHub repository via Contents API |
| Auth | GitHub PAT in `localStorage` |
| Markdown render | `react-markdown` v10 |
| Hosting | GitHub Pages (static) |

---

## Architecture

```
Browser
  └── /notebook page (React, client-only)
        ├── GitHub Contents API  ──→  reads/writes .md files under docs/
        └── localStorage         ──→  GitHub PAT only
```

Every read and write goes directly from the browser to `https://api.github.com/repos/{owner}/{repo}/contents/`. No proxy, no serverless function, no secrets in source code.

---

## Repository layout

```
docs/
  {notebook-slug}/          ← one folder per notebook
    _category_.json         ← Docusaurus sidebar label (created on new notebook)
    _metadata.json          ← title map: { "file.md": "Note Title" }
    {note-slug}.md          ← raw Markdown content (no frontmatter)
```

Files starting with `_` are excluded from the note list UI by a filter on `name.startsWith('_')`.

---

## Features

### 1. GitHub PAT Authentication
On first visit the page shows a centered token input card. The user pastes a GitHub Personal Access Token (with `repo` scope). Before saving, the token is verified by making a real API call (`GET /contents/docs`). On success it is stored in `localStorage` under the key `gh_pat` and the notebook UI loads. On subsequent visits `localStorage` is read on mount — no re-entry needed.

A 🔑 button (bottom-right corner of the workspace) opens a dismissable re-enter dialog. The dialog has an ✕ close button so the user can cancel without changing anything. "Forget token" wipes `localStorage`.

### 2. Notebook Sidebar
The left sidebar (240 px wide) lists all folders under `docs/` as notebooks. Folders are fetched from `GET /contents/docs`. Clicking a notebook loads its notes and metadata. The active notebook is highlighted with a left border accent and bold text.

A "+ New Notebook" button at the bottom opens a form. Creating a notebook writes `docs/{slug}/_category_.json` with a Docusaurus-compatible label and position. Because GitHub does not allow empty folders, this file doubles as the folder anchor.

### 3. Note List
When a notebook is selected the right panel shows all `.md` files in that folder (filtered: type `file`, extension `.md`/`.mdx`, name not starting with `_`). Each row shows the note title from `_metadata.json` (falls back to filename without extension). A hover-only 🗑 trash button appears on each row.

### 4. Inline Delete Confirmation
Clicking the trash icon replaces the row's right side with "Delete? Yes / No" — no modal, no browser dialog. Confirming calls `DELETE /contents/…` with the file's blob SHA. Cancel restores the normal row.

### 5. Note Editor
Clicking a note opens a full-panel editor. The editor has:
- A **title input** (styled borderless, 20 px bold) — stored separately in `_metadata.json`, never written into the note file itself.
- A **Markdown textarea** — monospace, flex-fill, holds raw content.
- Placeholder text: "Write your note in Markdown…"

The `key` prop on the editor component is set to `editingNote.path ?? 'new'` so React fully remounts (resets internal state) when switching notes.

### 6. Render Markdown Toggle
A toggle button in the editor header switches between raw textarea and rendered preview. The toggle shows a colored dot indicator (muted = off, primary color = on).

In render mode:
- The title input is hidden.
- `react-markdown` renders `# {title}\n\n{content}` — title becomes an H1 heading.
- The `<BrowserOnly>` wrapper from Docusaurus prevents SSR crashes (react-markdown v9+ is ESM-only).

Toggling back to edit mode re-focuses the textarea.

### 7. Ctrl+S / Cmd+S Auto-Save
A `keydown` event listener on `window` intercepts `Ctrl+S` / `Cmd+S`. `e.preventDefault()` suppresses the browser's native save dialog. If a save is not already in progress, `onSave(title, content)` is called. The listener is re-registered on every render (via `useEffect` with `[title, content, saving, onSave]` deps) to avoid stale closures.

### 8. Save Modal with Progress
Pressing Save Note or Ctrl+S opens a centered modal overlay with a progress bar. The save has two phases:

**Phase 1 — Push** (bar animates 5 → 45%):  
`PUT /contents/docs/{notebook}/{file}` with base64-encoded content and the current blob SHA. A `setInterval` drives the animation while awaiting the response.

**Phase 2 — Sync poll** (bar animates 50 → 90%):  
Polls `GET /contents/docs/{notebook}?ref=main&_={timestamp}` every 1.5 s until the saved file appears in the listing. The cache-busting `_` query param prevents stale CDN responses. On success the bar snaps to 100%, shows "✓ Saved successfully!" in green, then auto-dismisses after 1 s.

The note stays open throughout. No view change on save.

After every successful save the response's `content.sha` is stored in component state so the next save uses the correct SHA without re-fetching.

### 9. Merge Conflict Handling (409)
If the PUT returns 409 (SHA mismatch — file was updated elsewhere):
1. The modal closes.
2. The latest file metadata is fetched to get the current blob SHA.
3. State is updated with the new SHA.
4. An amber banner appears inside the editor: "Merge conflict detected. The file was updated remotely. Latest SHA loaded — your edits are preserved."
5. "Retry Save" re-triggers the save with the refreshed SHA.
6. "Dismiss" hides the banner.

### 10. Delete Sync Bar
After a confirmed delete the notebook folder is polled every 2 s (up to 8 attempts) until the deleted file no longer appears in the listing. A 3 px fill bar at the top of the note list panel animates during the wait and disappears when done. This uses the same `startSyncPoll(fileName, notebook, mode)` function used for post-save sync, with `mode = 'gone'` inverting the condition.

### 11. Title via `_metadata.json`
Titles are stored separately from note content in a per-notebook `_metadata.json`:

```json
{ "my-note.md": "My Note Title", "another.md": "Another Note" }
```

On notebook select, `_metadata.json` is fetched alongside the note list. Its blob SHA is retained for subsequent updates.

On save: after the note content PUT succeeds, `_metadata.json` is updated with the new/changed title via another PUT. The metadata SHA in state is updated from the response.

On delete: the note's entry is removed from `_metadata.json` before the sync poll starts.

On open: the title is read from `notebookMetadata.titles[note.name]` and pre-populated in the title input.

---

## Key Decisions

| Decision | Rationale |
|---|---|
| Static-only, no backend | Single user, token in browser. No server = no secrets leak vector. |
| `localStorage` for PAT | Never in source code. Verify token before saving to catch bad tokens early. |
| `react-markdown` over `marked` / `markdown-it` | No `dangerouslySetInnerHTML`, native React elements, fits Docusaurus's remark/unified ecosystem. v9+ is ESM-only — wrap in `<BrowserOnly>`. |
| `?_=Date.now()` cache buster on poll | GitHub's CDN caches Contents API responses. Without it the poll may see stale data indefinitely. |
| Keep note open after save | Avoids disruptive context switch. Modal gives clear feedback without navigation. |
| SHA required for updates | Every PUT to an existing file must include the current blob SHA or GitHub returns 409. Always store the SHA from the PUT response (`resData.content.sha`) — not from the directory listing — because it reflects the committed state. |
| `_metadata.json` for titles | Keeps note files clean (raw Markdown only). Titles can change without touching note content. Excluded from UI by `!name.startsWith('_')`. |
| `_category_.json` as folder anchor | GitHub has no empty folder concept. This file also configures the Docusaurus sidebar label. |
| Slugified filenames on first save | Stable, URL-safe identifiers. Filename is fixed at creation — renaming the title does not rename the file. |
| `key={editingNote?.path ?? 'new'}` on editor | Forces full React remount when switching notes, resetting all internal state (title, content, renderMode). Without it, the previous note's content bleeds into the next. |
| `mode` param on `startSyncPoll` | Single function handles both "wait until file appears" (post-save) and "wait until file is gone" (post-delete). |
| Backwards-compat on open | Old notes had frontmatter + `# Title` heading. `openNote` strips both before loading content into the editor. |

---

## Prompts Used (in order)

These are the exact or paraphrased user prompts that drove the implementation. An AI reproducing this can use them as a build sequence.

1. **Bootstrap**
   > "Add functionality to this website to be able to add a new folder and files within a folder. It should show up like a notebook with sidebar. 'My Notebooks' in the left panel should be checked in as folders under docs in the GitHub repository and individual notes on the right as individual files under that notebook folder. To wire up this static website to GitHub use Option 1 [browser PAT input, localStorage]."

2. **Launch & test**
   > "Launch on local to test it out."

3. **Save UX — fill bar**
   > "Update the code to call save button just as 'Save Note' instead of 'Save to GitHub'. Also add a refresh function with fill bar at top to refresh to show the note after save. Note that it may take a few seconds for the saved note to appear, so show fill bar on top and poll the website for refresh until the new note appears. Refresh minimal page space as required."

4. **Delete**
   > "Add functionality to delete a note."

5. **Delete fill bar**
   > "After deletion, just like save show the fill bar on top and poll for refresh, until that note is gone from UI."

6. **Button rename + separator**
   > "Rename cancel button as 'Close Note', add separator between buttons."

7. **Ctrl+S**
   > "Add functionality to auto save on pressing Ctrl+S."

8. **Save modal + conflict handling**
   > "Make sure to read back from repository once 'Save Note' button is pressed or Ctrl+S is pressed. Do not automatically close the note. Keep current window as is. Saving should show a modal, with progress, which completes only when note is saved and retrieved back from repository. In case of merge conflicts, automerge and show a banner note in area with buttons, to clear the conflicts and try saving again."

9. **Render Markdown toggle**
   > "When I click a note, add a toggle on top just left of 'New Note' to 'Render Markdown'. Clicking on toggle should render the current visible note as markdown. Turning toggle off should toggle back to text format. Make sure to use static libraries to render markdown."

10. **Title via metadata**
    > "Now implement the 'title functionality' as follows: 1. Title should show up just above the note in a '#' rendering of markdown. However, do not store the title directly in the note itself. Create a special _metadata file in each notebook folder and store mapping of note files to their title in that _metadata file. Keep it updated on local on each save, refresh, page load etc. Use title from that file when rendering a note from a specific file. Make sure that _metadata file is not visible anywhere on the UI."

---

## Implementation Blueprint

Use this section to reconstruct the module from scratch.

### File to create
`src/pages/notebook.js` — single self-contained React page.

### Constants at top
```js
const OWNER = 'your-github-username';
const REPO  = 'your-repo-name';
const BRANCH = 'main';
const DOCS_PATH = 'docs';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
```

### Utilities
```js
function slugify(text)    // lowercase, spaces→hyphens, strip non-alphanumeric
function b64Encode(str)   // btoa(unescape(encodeURIComponent(str)))
function b64Decode(str)   // decodeURIComponent(escape(atob(str.replace(/\n/g,''))))
```

### Components (build in this order)
1. `TokenGate` — password input, verifies PAT, saves to localStorage, supports `onDismiss`
2. `Sidebar` — notebook list + "New Notebook" button
3. `SaveModal` — overlay with step label + progress bar (steps: pushing/syncing/done/error)
4. `NoteList` — note rows with hover-delete + inline confirm, sync fill bar, reads titles from `metadata` prop
5. `NoteEditor` — title input + textarea, Render Markdown toggle (BrowserOnly + react-markdown), Ctrl+S handler, conflict banner
6. `NewNotebookPanel` — name input, preview of folder path
7. `EmptyState` — placeholder when no notebook selected

### State in main `NotebookPage` component
```
pat                  string|null
notebooks            array
selectedNotebook     object|null
notes                array
notebookMetadata     { titles: {}, sha: null }
view                 'list' | 'edit' | 'new-notebook'
loadingNotebooks     bool
loadingNotes         bool
saving               bool
editingNote          { path, sha, title, content } | null
syncing              bool          ← for delete fill bar
syncProgress         number
saveModal            { open, step, progress, error }
conflictBanner       bool
showTokenDialog      bool
syncIntervalRef      useRef
syncTimeoutRef       useRef
```

### API call patterns

**Read directory**
```js
GET ${API}/docs/${notebook.name}?ref=main&_=${Date.now()}
→ array; filter: type==='file' && /\.mdx?$/.test(name) && !name.startsWith('_')
```

**Read file**
```js
GET ${API}/docs/${notebook.name}/${file.name}
→ { content: base64, sha }
```

**Create or update file**
```js
PUT ${API}/docs/${notebook.name}/${filename}
body: { message, content: b64Encode(text), branch, sha? }
→ { content: { sha } }   // store this sha for next PUT
```

**Delete file**
```js
DELETE ${API}/docs/${notebook.name}/${filename}
body: { message, sha, branch }
```

### Polling pattern
```js
// Poll every 1.5 s, up to 8 attempts, with cache-busting URL
// mode='appeared': resolve when file IS in listing
// mode='gone':     resolve when file is NOT in listing
// Animate a progress bar 0→85% via setInterval while waiting
// On condition met: progress=100, update notes state, hide bar after 600 ms
```

### Metadata pattern
```js
// _metadata.json lives at docs/{notebook}/_metadata.json
// Shape: { "file.md": "Title string" }
// fetchMetadata(notebook)      — called on notebook select
// pushMetadataUpdate(notebook, newTitles, currentSha)  — called after note save/delete
// Always use the SHA from the PUT response for next update
```

### Navbar entry (docusaurus.config.js)
```js
{ to: '/notebook', label: 'Write', position: 'right' }
```

---

## Gotchas

| Gotcha | Fix |
|---|---|
| GitHub base64 has `\n` every 60 chars | Strip `\n` before `atob()` |
| SHA required for every update | Store `resData.content.sha` after each PUT, not just on open |
| SHA from directory listing ≠ correct SHA for PUT | Always use the SHA from a direct file GET or from the PUT response |
| CDN cache on GET after write | Add `?_=Date.now()` to every poll request |
| `react-markdown` v9+ is ESM-only | Wrap in Docusaurus `<BrowserOnly>`, use `require()` inside render prop |
| Empty first save has no SHA | Omit `sha` field entirely on first PUT — GitHub treats it as create |
| `_metadata.json` 409 on concurrent edits | Fetch latest SHA on conflict, retry silently |
| Ctrl+S opens browser save dialog | Call `e.preventDefault()` before your handler |
| Stale closure in Ctrl+S handler | Include `title`, `content`, `saving`, `onSave` in `useEffect` deps array |
| React keeps old note state when switching | Set `key={editingNote?.path ?? 'new'}` on editor to force remount |
| `setInterval` leaks on unmount | Store IDs in `useRef`, clear in cleanup `useEffect` |
| `localStorage` crash during SSR | Guard: `typeof window !== 'undefined'` or read in `useEffect` |
| Empty folder not allowed on GitHub | Always write `_category_.json` when creating a new notebook |
