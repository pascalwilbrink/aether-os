import "server-only";

import { config } from "../config";
import type { components } from "./generated/proxenos-api";
import { call } from "./http";

/** Proxenos types, generated from ../contracts/proxenos.openapi.yaml. */
export type ProxenosSchemas = components["schemas"];
export type Installation = ProxenosSchemas["InstallationResponse"];
export type Repository = ProxenosSchemas["RepositoryResponse"];
export type RepositoryLink = ProxenosSchemas["RepositoryLinkResponse"];

type Page<T> = import("./http").Page<T>;

const proxenos = <T>(path: string, token: string, init?: Parameters<typeof call>[3]) =>
  call<T>(config.proxenosUrl, path, token, init);

const org = (organizationId: string) => `/v1/organizations/${organizationId}`;

// --- Connecting the GitHub App (`org:manage`) and its installations ---

/**
 * Starts connecting the GitHub App: the installation page to send the
 * person to (with a single-use state), and where GitHub's round trip comes
 * back to in Iris (`returnTo`, a path).
 */
export const connectGitHub = (token: string, organizationId: string, returnTo: string) =>
  proxenos<ProxenosSchemas["GitHubConnectResponse"]>(`${org(organizationId)}/github/connect`, token, {
    method: "POST",
    body: { returnTo },
  });

export const listInstallations = (token: string, organizationId: string) =>
  proxenos<Page<Installation>>(`${org(organizationId)}/installations?limit=100`, token);

/** Reads an installation from GitHub again (e.g. after a missed webhook). */
export const syncInstallation = (token: string, organizationId: string, installationId: string) =>
  proxenos<Installation>(`${org(organizationId)}/installations/${installationId}/sync`, token, { method: "POST" });

/** The repositories the organization's installations cover (available ones, by full name). */
export const listRepositories = (token: string, organizationId: string) =>
  proxenos<Page<Repository>>(`${org(organizationId)}/repositories?limit=100`, token);

// --- A project's repositories (`project:read`, `project:manage`) ---

const linksOf = (organizationId: string, projectId: string) =>
  `${org(organizationId)}/projects/${projectId}/repositories`;

export const listRepositoryLinks = (token: string, organizationId: string, projectId: string) =>
  proxenos<Page<RepositoryLink>>(`${linksOf(organizationId, projectId)}?limit=100`, token);

export const linkRepository = (token: string, organizationId: string, projectId: string, repositoryId: string) =>
  proxenos<RepositoryLink>(linksOf(organizationId, projectId), token, { method: "POST", body: { repositoryId } });

export const unlinkRepository = (token: string, organizationId: string, projectId: string, linkId: string) =>
  proxenos<void>(`${linksOf(organizationId, projectId)}/${linkId}`, token, { method: "DELETE" });

export { orUnavailable } from "./http";
