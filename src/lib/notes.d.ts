// Type declarations for the shared pure-helper module `notes.js`.
//
// `notes.js` stays JavaScript because the Node build chain (sidebars.js, the
// notebook-snapshot plugin via notebooksFs.js) imports it with an explicit
// `.js` specifier and cannot resolve `.ts`. This ambient declaration gives the
// browser-side TypeScript layer full types for the same module.

import type { NoteMetadata } from '@site/src/types';

export const OWNER: string;
export const REPO: string;
export const BRANCH: string;
export const DOCS_PATH: string;
export const API: string;

export function slugify(text: string): string;
export function b64Encode(str: string): string;
export function b64Decode(str: string): string;

export function parseMetadata(obj: unknown): NoteMetadata;
export function serializeMetadata(
  titles: Record<string, string>,
  order: string[],
  updated?: Record<string, number>,
): string;

export function noteUpdatedAt(
  name: string,
  updated?: Record<string, number>,
): number | null;

export function formatTimestamp(ms: number | null | undefined): string;

export function orderNotes<T extends { name: string }>(
  notes: T[],
  order?: string[],
): T[];

export function moveToIndex(list: string[], item: string, index: number): string[];
