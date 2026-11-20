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

export type LoculusFile = LoculusSchemas["FileResponse"];

/** A project's file (`file:read`). */
export const getFile = (
  token: string,
  organizationId: string,
  projectId: string,
  fileId: string,
) =>
  call<LoculusFile>(
    config.loculusUrl,
    `/v1/organizations/${organizationId}/projects/${projectId}/files/${fileId}`,
    token,
  );

/**
 * Uploads a file to a project with the person's own token (`file:write`):
 * declares it, sends the bytes to the signed `PUT` (the storage checks them
 * against the declaration), and completes it.
 */
export async function uploadFile(
  token: string,
  organizationId: string,
  projectId: string,
  file: {
    fileName: string;
    contentType: string;
    bytes: Uint8Array<ArrayBuffer>;
  },
): Promise<LoculusFile> {
  const files = `/v1/organizations/${organizationId}/projects/${projectId}/files`;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", file.bytes),
  );
  const sha256 = Array.from(digest, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const { file: created, upload } = await call<
    LoculusSchemas["CreatedFileResponse"]
  >(config.loculusUrl, files, token, {
    method: "POST",
    body: {
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.bytes.length,
      sha256,
    },
  });
  const uploaded = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file.bytes,
    signal: AbortSignal.timeout(60_000),
  });
  if (!uploaded.ok) {
    throw new Error(
      `The file storage refused ${file.fileName} (HTTP ${uploaded.status})`,
    );
  }
  return call<LoculusFile>(
    config.loculusUrl,
    `${files}/${created.id}/complete`,
    token,
    { method: "POST" },
  );
}
