import "server-only";

import { config } from "../config";
import type { components } from "./generated/polis-api";
import { call } from "./http";

/** Polis types, generated from ../contracts/polis.openapi.yaml. */
export type PolisSchemas = components["schemas"];
export type Organization = PolisSchemas["OrganizationResponse"];
export type Project = PolisSchemas["ProjectResponse"];
export type SubjectMembership = PolisSchemas["SubjectMembershipResponse"];

type Page<T> = { items: T[]; nextCursor: string | null };

/** The signed-in person's organizations, with names (any token of theirs). */
export const myMemberships = (token: string, sub: string) =>
  call<Page<SubjectMembership>>(
    config.polisUrl,
    `/v1/memberships?subjectType=user&subject=${encodeURIComponent(sub)}&limit=100`,
    token,
  );

/** Founds an organization; the caller becomes its owner. */
export const createOrganization = (token: string, body: PolisSchemas["CreateOrganizationRequest"]) =>
  call<Organization>(config.polisUrl, "/v1/organizations", token, { method: "POST", body });

export const getOrganization = (token: string, organizationId: string) =>
  call<Organization>(config.polisUrl, `/v1/organizations/${organizationId}`, token);

export const getProject = (token: string, organizationId: string, projectId: string) =>
  call<Project>(config.polisUrl, `/v1/organizations/${organizationId}/projects/${projectId}`, token);

/** The projects the caller can read. */
export const listProjects = (token: string, organizationId: string) =>
  call<Page<Project>>(config.polisUrl, `/v1/organizations/${organizationId}/projects?limit=100`, token);
