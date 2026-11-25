import "server-only";

import { config } from "../config";
import type { components } from "./generated/pistis-api";
import { all, call, type Page } from "./http";

/** Pistis types, generated from contracts/pistis.openapi.yaml (`pnpm generate:api`). */
export type OrganizationUser =
  components["schemas"]["OrganizationUserResponse"];
export type ServiceAccount = components["schemas"]["ServiceAccountResponse"];

/** The organization's users (its members) with their profiles (`member:read`). */
export const listOrganizationUsers = (token: string, organizationId: string) =>
  all((cursor) =>
    call<Page<OrganizationUser>>(
      config.pistisUrl,
      `/v1/organizations/${organizationId}/users?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      token,
    ),
  );

/** The organization's service accounts (`member:read`), managed in Iris. */
export const listServiceAccounts = (token: string, organizationId: string) =>
  all((cursor) =>
    call<Page<ServiceAccount>>(
      config.pistisUrl,
      `/v1/organizations/${organizationId}/service-accounts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      token,
    ),
  );
