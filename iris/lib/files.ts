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

/** Files a task can start from: as many and as large as Hephaestus takes. */
export const INPUT_FILE_LIMITS = {
  count: 20,
  bytes: 25 * 1024 * 1024,
} as const;

/** The files picked in a form (an empty file field sends one nameless, empty file). */
export function pickedFiles<T extends { name: string; size: number }>(
  entries: unknown[],
): T[] {
  return entries.filter(
    (entry): entry is T =>
      typeof entry === "object" &&
      entry !== null &&
      "name" in entry &&
      "size" in entry &&
      Boolean((entry as T).name || (entry as T).size),
  );
}

/** Why these files can't start a task, or null. */
export function inputFilesProblem(
  files: { name: string; size: number }[],
): string | null {
  if (files.length > INPUT_FILE_LIMITS.count) {
    return `A task starts from at most ${INPUT_FILE_LIMITS.count} files.`;
  }
  const large = files.find((file) => file.size > INPUT_FILE_LIMITS.bytes);
  if (large) {
    return `${large.name} is ${formatBytes(large.size)}; a task's files are at most ${formatBytes(INPUT_FILE_LIMITS.bytes)}.`;
  }
  const bad = files.find(
    (file) =>
      /[/\\\u0000-\u001f\u007f]/.test(file.name) || file.name.length > 255,
  );
  return bad ? `${bad.name} isn't a name a file can have here.` : null;
}

/** A file's media type as Loculus takes it; the browser's, else by nothing. */
export function contentTypeFor(type: string): string {
  return /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/.test(
    type,
  )
    ? type
    : "application/octet-stream";
}
