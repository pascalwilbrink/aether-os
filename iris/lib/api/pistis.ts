import "server-only";

import { config } from "../config";
import type { components } from "./generated/pistis-api";
import { call } from "./http";

/** Pistis types, generated from ../contracts/pistis.openapi.yaml. */
export type ServiceAccount = components["schemas"]["ServiceAccountResponse"];

type Page<T> = { items: T[]; nextCursor: string | null };

/** The organization's service accounts (`member:read`): what tasks run as. */
export const listServiceAccounts = (token: string, organizationId: string) =>
  call<Page<ServiceAccount>>(
    config.pistisUrl,
    `/v1/organizations/${organizationId}/service-accounts?limit=100`,
    token,
  );
