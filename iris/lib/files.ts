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
export function downloadHref(organizationId: string, projectId: string, fileId: string): string {
  return `/orgs/${organizationId}/projects/${projectId}/files/${fileId}/download`;
}
