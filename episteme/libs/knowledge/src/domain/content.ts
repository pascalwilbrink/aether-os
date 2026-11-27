import { createHash } from 'node:crypto';

import { createTwoFilesPatch } from 'diff';

/**
 * A version's content as stored and checksummed: Markdown with `\n` line
 * endings, so the same text always has the same checksum.
 */
export function canonicalContent(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

/** SHA-256 of the canonical content, hex: what approvals and indexing are keyed by. */
export function checksumOf(content: string): string {
  return createHash('sha256').update(canonicalContent(content)).digest('hex');
}

/** A unified diff from one version's Markdown to another's; empty when they're the same. */
export function unifiedDiff(
  from: { number: number; content: string },
  to: { number: number; content: string },
): string {
  if (from.content === to.content) {
    return '';
  }
  return createTwoFilesPatch(
    `version ${from.number}`,
    `version ${to.number}`,
    from.content,
    to.content,
    undefined,
    undefined,
    { context: 3 },
  );
}
