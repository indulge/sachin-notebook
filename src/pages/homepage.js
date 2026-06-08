import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { usePluginData } from '@docusaurus/useGlobalData';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {
  API, DOCS_PATH, BRANCH,
  parseMetadata, orderNotes, noteUpdatedAt,
} from '@site/src/lib/notes';
import styles from './index.module.css';

const GH_HEADERS = { Accept: 'application/vnd.github+json' };
const NOTE_RE = /\.mdx?$/;

// ── Live (unauthenticated) GitHub reads ──────────────────────────────────────
// The public repo is readable without a token; we drop the Authorization header
// the Write app uses. Unauthenticated requests are rate-limited (~60/hr per IP),
// so failures fall back to the build-time snapshot.

async function fetchDirFiles(dir) {
  const res = await fetch(`${API}/${DOCS_PATH}/${dir}?ref=${BRANCH}&_=${Date.now()}`, { headers: GH_HEADERS });
  if (!res.ok) throw res;
  return (await res.json())
    .filter(i => i.type === 'file' && NOTE_RE.test(i.name) && !i.name.startsWith('_'))
    .map(i => ({ name: i.name }));
}

async function fetchDirMetadata(dir) {
  try {
    const res = await fetch(`${API}/${DOCS_PATH}/${dir}/_metadata.json?ref=${BRANCH}&_=${Date.now()}`, { headers: GH_HEADERS });
    if (res.ok) {
      const data = await res.json();
      // The contents API returns base64; decode without pulling in b64Decode's
      // escape() path — atob + a JSON parse is enough for this small file.
      return parseMetadata(JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))));
    }
  } catch { /* fall through to empty */ }
  return parseMetadata(null);
}

async function fetchLiveNotebooks() {
  const res = await fetch(`${API}/${DOCS_PATH}?ref=${BRANCH}&_=${Date.now()}`, { headers: GH_HEADERS });
  if (!res.ok) {
    const err = new Error(res.status === 403 ? 'rate-limited' : 'fetch-failed');
    err.rateLimited = res.status === 403;
    throw err;
  }
  const dirs = (await res.json()).filter(i => i.type === 'dir');
  const notebooks = await Promise.all(dirs.map(async (d) => {
    const [files, meta] = await Promise.all([fetchDirFiles(d.name), fetchDirMetadata(d.name)]);
    const notes = orderNotes(files, meta.order).map(n => ({
      file: n.name,
      id: `${d.name}/${n.name.replace(NOTE_RE, '')}`,
      title: meta.titles[n.name] || n.name.replace(NOTE_RE, ''),
      updated: noteUpdatedAt(n.name, meta.updated),
    }));
    return { dir: d.name, notes };
  }));
  return notebooks.filter(nb => nb.notes.length > 0);
}

// ── Hub ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  const snapshot = usePluginData('notebook-snapshot');
  const snapNotebooks = snapshot?.notebooks ?? [];

  // Build-time facts used to (a) seed the initial render, (b) keep notebook
  // labels/order, and (c) decide whether a live note is actually deployed yet.
  const publishedSet = useMemo(
    () => new Set(snapNotebooks.flatMap(nb => nb.notes.map(n => n.id))),
    [snapNotebooks]
  );
  const labelMap = useMemo(
    () => new Map(snapNotebooks.map(nb => [nb.dir, nb.label])),
    [snapNotebooks]
  );
  const snapOrder = useMemo(() => snapNotebooks.map(nb => nb.dir), [snapNotebooks]);

  const seed = useMemo(
    () => snapNotebooks.map(nb => ({
      dir: nb.dir,
      label: nb.label,
      notes: nb.notes.map(n => ({ ...n, published: true })),
    })),
    [snapNotebooks]
  );

  const [notebooks, setNotebooks] = useState(seed);

  // Pull the live listing once on mount so the "Browse My Notes" link points at
  // the most recently published note. Failures keep the build-time seed.
  const refresh = useCallback(async () => {
    try {
      const live = await fetchLiveNotebooks();
      live.sort((a, b) => {
        const ia = snapOrder.indexOf(a.dir);
        const ib = snapOrder.indexOf(b.dir);
        return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      });
      setNotebooks(live.map(nb => ({
        dir: nb.dir,
        label: labelMap.get(nb.dir) || nb.dir,
        notes: nb.notes.map(n => ({ ...n, published: publishedSet.has(n.id) })),
      })));
    } catch {
      /* offline / rate-limited — keep the build-time snapshot */
    }
  }, [labelMap, publishedSet, snapOrder]);

  useEffect(() => { refresh(); }, [refresh]);

  // First published note — lets the "Browse My Notes" card bridge straight into
  // the reading area; falls back to the writing workspace if nothing exists yet.
  const firstNote = useMemo(() => {
    for (const nb of notebooks) {
      const n = nb.notes.find(x => x.published);
      if (n) return n;
    }
    return null;
  }, [notebooks]);
  const browseHref = firstNote ? `/read/${firstNote.id}` : '/write';

  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <div className={styles.pageBg}>
        <header className={styles.hero}>
          <div className="container">
            <Heading as="h1" className={styles.heroTitle}>{siteConfig.title}</Heading>
            <p className={styles.heroTagline}>{siteConfig.tagline}</p>

            <div className={styles.entryGrid}>
              <Link to={browseHref} className={`${styles.entryCard} ${styles.entryCardPrimary}`}>
                <span className={styles.entryEyebrow}>Reading</span>
                <span className={styles.entryTitle}>Browse My Notes</span>
                <span className={styles.entryDesc}>
                  Read through published notebooks in a calm, distraction-free reader.
                </span>
                <span className={styles.entryCta}>Open the library →</span>
              </Link>

              <Link to="/write" className={`${styles.entryCard} ${styles.entryCardSecondary}`}>
                <span className={styles.entryEyebrow}>Writing</span>
                <span className={styles.entryTitle}>Quick Draft Workspace</span>
                <span className={styles.entryDesc}>
                  Jump into a clean editing canvas to capture and commit a new note.
                </span>
                <span className={styles.entryCta}>Start writing →</span>
              </Link>
            </div>
          </div>
        </header>
      </div>
    </Layout>
  );
}
