/** A size for people: bytes, KB, MB or GB (powers of 1024, one decimal). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Where Iris downloads a project's file (a fresh signed URL each time). */
export function downloadHref(
  organizationId: string,
  projectId: string,
  fileId: string,
): string {
  return `/orgs/${organizationId}/projects/${projectId}/files/${fileId}/download`;
}

/** How a file artifact can be previewed in Iris, if at all. */
export type Preview = "image" | "html" | "text" | null;

const IMAGES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
]);
const TEXTS = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/javascript",
  "application/x-sh",
]);
/** The largest file previewed, by kind: they're fetched whole. */
export const PREVIEW_LIMITS = {
  image: 10 * 1024 * 1024,
  html: 1024 * 1024,
  text: 256 * 1024,
} as const;

export function previewOf(contentType: string, sizeBytes: number): Preview {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const kind: Preview = IMAGES.has(type)
    ? "image"
    : type === "text/html"
      ? "html"
      : type.startsWith("text/") || TEXTS.has(type)
        ? "text"
        : null;
  return kind && sizeBytes <= PREVIEW_LIMITS[kind] ? kind : null;
}

/**
 * An agent's HTML as a sandboxed frame's document: a Content-Security-Policy
 * first, so it loads nothing from anywhere (its own inline styles, scripts
 * and data: URLs only). The frame itself has no same-origin access to Iris.
 */
export const PREVIEW_CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline' data:; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";

export function previewDocument(html: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">\n${html}`;
}
