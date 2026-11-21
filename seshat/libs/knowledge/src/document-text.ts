import mammoth from 'mammoth';
import { getDocumentProxy, extractText as pdfText } from 'unpdf';

/**
 * The text Seshat can search in a document, by its content type (or, for
 * a generic one, its file name): Markdown, plain text, CSV, JSON and HTML
 * as they are; PDF (its text layer, page by page, with pdf.js through
 * `unpdf`) and Word `.docx` (with `mammoth`). Anything else (older `.doc`,
 * spreadsheets, images) is `unsupported`: kept, but searchable by its title
 * only. A file of a supported type that can't be read (damaged, encrypted,
 * or a scanned PDF without a text layer) is `unreadable`, with why.
 */
export type ExtractedText =
  | { kind: 'text'; text: string }
  | { kind: 'unsupported' }
  | { kind: 'unreadable'; reason: string };

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
const PDF_TYPE = 'application/pdf';
const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractText(
  bytes: Uint8Array,
  contentType: string,
  fileName: string,
): Promise<ExtractedText> {
  const type = contentType.split(';')[0].trim().toLowerCase();
  const generic = type === 'application/octet-stream' || type === '';
  if (type === PDF_TYPE || (generic && /\.pdf$/i.test(fileName))) {
    return fromPdf(bytes);
  }
  if (type === DOCX_TYPE || (generic && /\.docx$/i.test(fileName))) {
    return fromDocx(bytes);
  }
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
    .replace(/^\uFEFF/, '');
  return {
    kind: 'text',
    text: normalize(html ? htmlToText(decoded) : decoded),
  };
}

/** A PDF's text layer, pages apart by a blank line. */
async function fromPdf(bytes: Uint8Array): Promise<ExtractedText> {
  let pages: string[];
  try {
    // pdf.js takes the buffer over: give it a copy. No console warnings
    // about damaged files: the reason comes back as the error.
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
    try {
      ({ text: pages } = await pdfText(pdf, { mergePages: false }));
    } finally {
      await pdf.cleanup();
    }
  } catch (error) {
    return {
      kind: 'unreadable',
      reason: `The PDF can't be read (${reasonOf(error)}).`,
    };
  }
  const text = normalize(pages.map((page) => normalize(page)).join('\n\n'));
  return text
    ? { kind: 'text', text }
    : {
        kind: 'unreadable',
        reason:
          "The PDF has no text layer (a scanned document?): Seshat can't read text from images yet.",
      };
}

/** A Word document's text, paragraphs apart. */
async function fromDocx(bytes: Uint8Array): Promise<ExtractedText> {
  try {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    const text = normalize(value);
    return text
      ? { kind: 'text', text }
      : { kind: 'unreadable', reason: 'The Word document has no text.' };
  } catch (error) {
    return {
      kind: 'unreadable',
      reason: `The Word document can't be read (${reasonOf(error)}).`,
    };
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
