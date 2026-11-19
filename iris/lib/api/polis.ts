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

/** A new project in the organization (`project:create`). */
export const createProject = (token: string, organizationId: string, body: PolisSchemas["CreateProjectRequest"]) =>
  call<Project>(config.polisUrl, `/v1/organizations/${organizationId}/projects`, token, { method: "POST", body });

/** The projects the caller can read. */
export const listProjects = (token: string, organizationId: string) =>
  call<Page<Project>>(config.polisUrl, `/v1/organizations/${organizationId}/projects?limit=100`, token);

// --- Memberships: organization roles, and project roles ---

export type Membership = PolisSchemas["MembershipResponse"];
export type ProjectMembership = PolisSchemas["ProjectMembershipResponse"];
export type SubjectType = PolisSchemas["SubjectType"];
export type OrganizationRole = PolisSchemas["OrganizationRole"];
export type ProjectRole = PolisSchemas["ProjectRole"];

const membershipsOf = (organizationId: string) => `/v1/organizations/${organizationId}/memberships`;
const projectMembershipsOf = (organizationId: string, projectId: string) =>
  `/v1/organizations/${organizationId}/projects/${projectId}/memberships`;

/** The organization's memberships (`member:read`): only users or only service accounts. */
export const listMemberships = (token: string, organizationId: string, subjectType: SubjectType) =>
  call<Page<Membership>>(
    config.polisUrl,
    `${membershipsOf(organizationId)}?subjectType=${subjectType}&limit=100`,
    token,
  );

export const createMembership = (
  token: string,
  organizationId: string,
  body: PolisSchemas["CreateMembershipRequest"],
) => call<Membership>(config.polisUrl, membershipsOf(organizationId), token, { method: "POST", body });

/** Replaces the roles. */
export const updateMembership = (
  token: string,
  organizationId: string,
  membershipId: string,
  roles: OrganizationRole[],
) =>
  call<Membership>(config.polisUrl, `${membershipsOf(organizationId)}/${membershipId}`, token, {
    method: "PUT",
    body: { roles },
  });

/** Removes the principal from the organization (and, in Polis, from its projects). */
export const deleteMembership = (token: string, organizationId: string, membershipId: string) =>
  call<void>(config.polisUrl, `${membershipsOf(organizationId)}/${membershipId}`, token, { method: "DELETE" });

/** Who has a role in the project (`project:read`). */
export const listProjectMemberships = (token: string, organizationId: string, projectId: string) =>
  call<Page<ProjectMembership>>(config.polisUrl, `${projectMembershipsOf(organizationId, projectId)}?limit=100`, token);

export const createProjectMembership = (
  token: string,
  organizationId: string,
  projectId: string,
  body: PolisSchemas["CreateProjectMembershipRequest"],
) =>
  call<ProjectMembership>(config.polisUrl, projectMembershipsOf(organizationId, projectId), token, {
    method: "POST",
    body,
  });

export const updateProjectMembership = (
  token: string,
  organizationId: string,
  projectId: string,
  membershipId: string,
  role: ProjectRole,
) =>
  call<ProjectMembership>(
    config.polisUrl,
    `${projectMembershipsOf(organizationId, projectId)}/${membershipId}`,
    token,
    {
      method: "PUT",
      body: { role },
    },
  );

export const deleteProjectMembership = (
  token: string,
  organizationId: string,
  projectId: string,
  membershipId: string,
) =>
  call<void>(config.polisUrl, `${projectMembershipsOf(organizationId, projectId)}/${membershipId}`, token, {
    method: "DELETE",
  });
