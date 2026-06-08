// Client-only Markdown preview shared by the editor and the inline tiles.
// react-markdown is pulled in lazily inside BrowserOnly (it is ESM-only and
// should not run during SSR), so the require call is intentional here.

import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { s } from './styles';

// Provided by the Docusaurus webpack/rspack runtime; type-only so it is erased.
declare function require(name: string): { default: React.ComponentType<{ children: string }> };

interface Props {
  title: string;
  content: string;
  /** `h1` for the full editor, `h2` for the compact tiles. */
  headingLevel?: 'h1' | 'h2';
  /** Wrapper style — `s.markdownPreview` (editor) or `s.tilePreview` (tile). */
  wrapperStyle: React.CSSProperties;
}

export default function MarkdownPreview({
  title,
  content,
  headingLevel = 'h2',
  wrapperStyle,
}: Props) {
  return (
    <BrowserOnly fallback={<div style={wrapperStyle}>Loading preview…</div>}>
      {() => {
        const ReactMarkdown = require('react-markdown').default;
        return (
          <div style={wrapperStyle}>
            {React.createElement(headingLevel, { style: s.previewTitle }, title.trim() || 'Untitled')}
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        );
      }}
    </BrowserOnly>
  );
}
