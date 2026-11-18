import "server-only";

import { config } from "../config";
import type { components } from "./generated/pistis-api";
import { call } from "./http";

/** Pistis types, generated from ../contracts/pistis.openapi.yaml. */
export type ServiceAccount = components["schemas"]["ServiceAccountResponse"];
export type OrganizationUser = components["schemas"]["OrganizationUserResponse"];

type Page<T> = { items: T[]; nextCursor: string | null };

const serviceAccountsOf = (organizationId: string) => `/v1/organizations/${organizationId}/service-accounts`;

/** The organization's service accounts (`member:read`): what tasks run as. */
export const listServiceAccounts = (token: string, organizationId: string) =>
  call<Page<ServiceAccount>>(config.pistisUrl, `${serviceAccountsOf(organizationId)}?limit=100`, token);

/** A new service account (`service-account:manage`); its roles are Polis memberships. */
export const createServiceAccount = (
  token: string,
  organizationId: string,
  body: components["schemas"]["CreateServiceAccountRequest"],
) => call<ServiceAccount>(config.pistisUrl, serviceAccountsOf(organizationId), token, { method: "POST", body });

/** Disables (its tokens and keys stop working) or enables it again. */
export const setServiceAccountEnabled = (
  token: string,
  organizationId: string,
  serviceAccountId: string,
  enabled: boolean,
) =>
  call<ServiceAccount>(
    config.pistisUrl,
    `${serviceAccountsOf(organizationId)}/${serviceAccountId}/${enabled ? "enable" : "disable"}`,
    token,
    { method: "POST" },
  );

/** The organization's people with their profiles (`member:read`); roles come from Polis. */
export const listOrganizationUsers = (token: string, organizationId: string) =>
  call<Page<OrganizationUser>>(config.pistisUrl, `/v1/organizations/${organizationId}/users?limit=100`, token);
