// Shared, pure helpers for working with the notebook repo and its per-notebook
// _metadata.json files. Imported by both the browser (the notebook workspace
// under src/components/, src/pages/index.js) and Node at build time (src/lib/notebooksFs.js, which
// feeds sidebars.js and the notebook-snapshot plugin). Keep this module free of
// browser- or Node-only APIs at the top level — atob/btoa are globals in both.

export const OWNER = 'indulge';
export const REPO = 'sachin-notebook';
export const BRANCH = 'main';
export const DOCS_PATH = 'docs';
export const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

export function slugify(text) {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function b64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export function b64Decode(str) {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}

// ── Metadata helpers ─────────────────────────────────────────────────────────
// The _metadata.json file holds note titles, the user-defined display order, and
// the last-updated timestamp (epoch millis) for each note.
// New format: { titles: { "file.md": "Title" }, order: [...], updated: { "file.md": 1700000000000 } }
// Legacy format: a flat { "file.md": "Title" } map (order derived from key order).

export function parseMetadata(obj) {
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

export function serializeMetadata(titles, order, updated) {
  return JSON.stringify({ titles, order, updated: updated || {} }, null, 2);
}

// Last-updated epoch millis for a note: prefer the stored timestamp, then fall
// back to the epoch suffix in the filename ("<slug>-<epochMillis>.md").
export function noteUpdatedAt(name, updated) {
  if (updated && updated[name]) return updated[name];
  const m = /-(\d{13})\.mdx?$/.exec(name);
  return m ? Number(m[1]) : null;
}

// Human-readable date + time, e.g. "Jun 7, 2026, 3:42 PM".
export function formatTimestamp(ms) {
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

// Sort the file listing by the saved order; anything not in `order` (newly
// created, legacy) is appended to the end, never sorted alphabetically.
export function orderNotes(notes, order) {
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
export function moveToIndex(list, item, index) {
  const result = [...list];
  const from = result.indexOf(item);
  if (from === -1) return result;
  result.splice(from, 1);
  const target = from < index ? index - 1 : index;
  result.splice(target, 0, item);
  return result;
}
