/**
 * The text Seshat can search in a document, by its content type (or, for
 * a generic one, its file name): Markdown, plain text, CSV, JSON and HTML.
 * Anything else (PDF, Office documents, images) is `unsupported` for now:
 * kept, but not searchable.
 */
export type ExtractedText =
  { kind: 'text'; text: string } | { kind: 'unsupported' };

const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/x-ndjson',
  'text/x-log',
]);
const TEXT_EXTENSIONS =
  /\.(md|markdown|txt|text|csv|json|log|ya?ml|rst|adoc)$/i;
const HTML_EXTENSIONS = /\.html?$/i;

export function extractText(
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
): ExtractedText {
  const type = contentType.split(';')[0].trim().toLowerCase();
  const generic = type === 'application/octet-stream' || type === '';
  const html =
    type === 'text/html' || (generic && HTML_EXTENSIONS.test(fileName));
  const text =
    TEXT_TYPES.has(type) ||
    type.endsWith('+json') ||
    (generic && TEXT_EXTENSIONS.test(fileName));
  if (!html && !text) {
    return { kind: 'unsupported' };
  }
  const decoded = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes)
    .replace(/^﻿/, '');
  return {
    kind: 'text',
    text: normalize(html ? htmlToText(decoded) : decoded),
  };
}

/** Readable text from HTML: no scripts, styles or tags, entities decoded. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(
        /<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi,
        '\n',
      )
      .replace(/<[^>]+>/g, ' '),
  );
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code[0] === '#') {
        const value =
          code[1] === 'x' || code[1] === 'X'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isFinite(value) && value > 0 && value <= 0x10ffff
          ? String.fromCodePoint(value)
          : entity;
      }
      return named[code.toLowerCase()] ?? entity;
    },
  );
}

/** Unix line ends, no trailing spaces, at most one blank line in a row. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
