import "server-only";

import { config } from "../config";
import type { components } from "./generated/polis-api";
import { all, call, type Page } from "./http";

/** Polis types, generated from contracts/polis.openapi.yaml (`pnpm generate:api`). */
export type PolisSchemas = components["schemas"];
export type Organization = PolisSchemas["OrganizationResponse"];
export type SubjectMembership = PolisSchemas["SubjectMembershipResponse"];
export type Department = PolisSchemas["DepartmentResponse"];
export type Team = PolisSchemas["TeamResponse"];
export type TeamMember = PolisSchemas["TeamMemberResponse"];
export type Project = PolisSchemas["ProjectResponse"];
export type Person = PolisSchemas["PersonResponse"];
export type PersonRequest = PolisSchemas["PersonRequest"];

const json = (method: string, body?: unknown) => ({ method, body });
const query = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams({ limit: "100" });
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
};

/** The signed-in person's organizations, with names and roles (any token of theirs). */
export const myMemberships = (token: string, sub: string) =>
  all((cursor) =>
    call<Page<SubjectMembership>>(
      config.polisUrl,
      `/v1/memberships?${query({ subjectType: "user", subject: sub, cursor })}`,
      token,
    ),
  );

export const getOrganization = (token: string, organizationId: string) =>
  call<Organization>(
    config.polisUrl,
    `/v1/organizations/${organizationId}`,
    token,
  );

// --- Departments ---

const departments = (organizationId: string) =>
  `/v1/organizations/${organizationId}/departments`;

export const listDepartments = (token: string, organizationId: string) =>
  all((cursor) =>
    call<Page<Department>>(
      config.polisUrl,
      `${departments(organizationId)}?${query({ cursor })}`,
      token,
    ),
  );

export const getDepartment = (
  token: string,
  organizationId: string,
  departmentId: string,
) =>
  call<Department>(
    config.polisUrl,
    `${departments(organizationId)}/${departmentId}`,
    token,
  );

export const createDepartment = (
  token: string,
  organizationId: string,
  body: PolisSchemas["CreateDepartmentRequest"],
) =>
  call<Department>(
    config.polisUrl,
    departments(organizationId),
    token,
    json("POST", body),
  );

export const updateDepartment = (
  token: string,
  organizationId: string,
  departmentId: string,
  body: PolisSchemas["UpdateDepartmentRequest"],
) =>
  call<Department>(
    config.polisUrl,
    `${departments(organizationId)}/${departmentId}`,
    token,
    json("PUT", body),
  );

export const archiveDepartment = (
  token: string,
  organizationId: string,
  departmentId: string,
) =>
  call<Department>(
    config.polisUrl,
    `${departments(organizationId)}/${departmentId}/archive`,
    token,
    json("POST"),
  );

// --- Teams ---

const teams = (organizationId: string) =>
  `/v1/organizations/${organizationId}/teams`;

export const listTeams = (
  token: string,
  organizationId: string,
  filter: { departmentId?: string; personId?: string } = {},
) =>
  all((cursor) =>
    call<Page<Team>>(
      config.polisUrl,
      `${teams(organizationId)}?${query({ ...filter, cursor })}`,
      token,
    ),
  );

export const getTeam = (token: string, organizationId: string, teamId: string) =>
  call<Team>(config.polisUrl, `${teams(organizationId)}/${teamId}`, token);

export const createTeam = (
  token: string,
  organizationId: string,
  body: PolisSchemas["CreateTeamRequest"],
) => call<Team>(config.polisUrl, teams(organizationId), token, json("POST", body));

export const updateTeam = (
  token: string,
  organizationId: string,
  teamId: string,
  body: PolisSchemas["UpdateTeamRequest"],
) =>
  call<Team>(
    config.polisUrl,
    `${teams(organizationId)}/${teamId}`,
    token,
    json("PUT", body),
  );

export const archiveTeam = (
  token: string,
  organizationId: string,
  teamId: string,
) =>
  call<Team>(
    config.polisUrl,
    `${teams(organizationId)}/${teamId}/archive`,
    token,
    json("POST"),
  );

export const listTeamMembers = (
  token: string,
  organizationId: string,
  teamId: string,
) =>
  all((cursor) =>
    call<Page<TeamMember>>(
      config.polisUrl,
      `${teams(organizationId)}/${teamId}/members?${query({ cursor })}`,
      token,
    ),
  );

export const addTeamMember = (
  token: string,
  organizationId: string,
  teamId: string,
  personId: string,
) =>
  call<TeamMember>(
    config.polisUrl,
    `${teams(organizationId)}/${teamId}/members`,
    token,
    json("POST", { personId }),
  );

export const removeTeamMember = (
  token: string,
  organizationId: string,
  teamId: string,
  personId: string,
) =>
  call<void>(
    config.polisUrl,
    `${teams(organizationId)}/${teamId}/members/${personId}`,
    token,
    json("DELETE"),
  );

// --- Persons ---

const persons = (organizationId: string) =>
  `/v1/organizations/${organizationId}/persons`;

export const listPersons = (
  token: string,
  organizationId: string,
  filter: { departmentId?: string } = {},
) =>
  all((cursor) =>
    call<Page<Person>>(
      config.polisUrl,
      `${persons(organizationId)}?${query({ ...filter, cursor })}`,
      token,
    ),
  );

export const getPerson = (
  token: string,
  organizationId: string,
  personId: string,
) =>
  call<Person>(config.polisUrl, `${persons(organizationId)}/${personId}`, token);

export const createPerson = (
  token: string,
  organizationId: string,
  body: PersonRequest,
) =>
  call<Person>(config.polisUrl, persons(organizationId), token, json("POST", body));

export const updatePerson = (
  token: string,
  organizationId: string,
  personId: string,
  body: PersonRequest,
) =>
  call<Person>(
    config.polisUrl,
    `${persons(organizationId)}/${personId}`,
    token,
    json("PUT", body),
  );

export const deletePerson = (
  token: string,
  organizationId: string,
  personId: string,
) =>
  call<void>(
    config.polisUrl,
    `${persons(organizationId)}/${personId}`,
    token,
    json("DELETE"),
  );

// --- Projects (read only: they're managed in Iris) ---

/** The organization's projects in a department. */
export const listProjectsInDepartment = (
  token: string,
  organizationId: string,
  departmentId: string,
) =>
  all((cursor) =>
    call<Page<Project>>(
      config.polisUrl,
      `/v1/organizations/${organizationId}/projects?${query({ departmentId, cursor })}`,
      token,
    ),
  );
