/**
 * `Content-Disposition: attachment` with the file's name (RFC 6266): a
 * plain-ASCII `filename` for old clients, and the exact name as
 * `filename*` (RFC 8187, UTF-8, percent-encoded).
 */
export function attachment(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
