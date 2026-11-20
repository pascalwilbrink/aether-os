import "server-only";

import { config } from "../config";
import type { components } from "./generated/loculus-api";
import { call } from "./http";

/** Loculus types, generated from ../contracts/loculus.openapi.yaml. */
export type LoculusSchemas = components["schemas"];

/**
 * A fresh signed URL that downloads a project's file as an attachment
 * (`file:read`). Never stored: it expires in minutes.
 */
export const fileDownload = (
  token: string,
  organizationId: string,
  projectId: string,
  fileId: string,
) =>
  call<LoculusSchemas["FileDownload"]>(
    config.loculusUrl,
    `/v1/organizations/${organizationId}/projects/${projectId}/files/${fileId}/download`,
    token,
  );

/**
 * A file's content as text, for a preview: through a fresh signed URL, at
 * most `limit` bytes (larger ones aren't previewed), decoded as UTF-8.
 */
export async function fileText(
  token: string,
  organizationId: string,
  projectId: string,
  fileId: string,
  limit: number,
): Promise<string> {
  const { url } = await fileDownload(token, organizationId, projectId, fileId);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`The file storage answered ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > limit) {
    throw new Error("The file is too large to preview");
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
