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
export const fileDownload = (token: string, organizationId: string, projectId: string, fileId: string) =>
  call<LoculusSchemas["FileDownload"]>(
    config.loculusUrl,
    `/v1/organizations/${organizationId}/projects/${projectId}/files/${fileId}/download`,
    token,
  );
