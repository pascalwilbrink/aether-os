/** About a few paragraphs: small enough to point at, large enough to mean something. */
export const CHUNK_MAX_CHARS = 1500;

/**
 * Splits text into chunks for search: whole paragraphs where they fit,
 * else sentences, else hard cuts, each at most `max` characters. A chunk
 * that starts a new section keeps its heading.
 */
export function chunkText(text: string, max = CHUNK_MAX_CHARS): string[] {
  const pieces = text
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitLong(paragraph.trim(), max))
    .filter((piece) => piece.length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const heading = /^#{1,6}\s/.test(piece);
    if (current && (heading || current.length + 2 + piece.length > max)) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function splitLong(paragraph: string, max: number): string[] {
  if (paragraph.length <= max) {
    return [paragraph];
  }
  const sentences = paragraph.match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g) ?? [
    paragraph,
  ];
  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > max) {
      if (current) {
        out.push(current.trim());
        current = '';
      }
      for (let i = 0; i < sentence.length; i += max) {
        out.push(sentence.slice(i, i + max).trim());
      }
      continue;
    }
    if (current.length + sentence.length > max) {
      out.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) {
    out.push(current.trim());
  }
  return out;
}
