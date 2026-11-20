import { describe, expect, it } from "vitest";

import type { OrganizationUser, ServiceAccount } from "./api/pistis";
import type { Membership, ProjectMembership } from "./api/polis";
import {
  grantableProjectRoles,
  people,
  projectAccess,
  runnableServiceAccounts,
  serviceAccountMembers,
  serviceAccountRows,
  withoutProjectRole,
} from "./members";

const ORG = "org-1";
const membership = (
  subjectType: "user" | "service_account",
  subject: string,
  roles: Membership["roles"],
) =>
  ({
    id: `m-${subject}`,
    organizationId: ORG,
    subjectType,
    subject,
    roles,
    createdBy: "u-ada",
    createdAt: "2026-11-18T10:00:00.000Z",
    updatedAt: "2026-11-18T10:00:00.000Z",
  }) satisfies Membership;
const grant = (
  subjectType: "user" | "service_account",
  subject: string,
  role: ProjectMembership["role"],
) =>
  ({
    id: `g-${subject}`,
    organizationId: ORG,
    projectId: "p-1",
    subjectType,
    subject,
    role,
    createdBy: "u-ada",
    createdAt: "2026-11-18T10:00:00.000Z",
    updatedAt: "2026-11-18T10:00:00.000Z",
  }) satisfies ProjectMembership;
const user = (
  id: string,
  displayName: string,
  email: string | null = null,
): OrganizationUser => ({
  id,
  displayName,
  email,
  status: "active",
});
const account = (
  id: string,
  name: string,
  status: ServiceAccount["status"] = "active",
): ServiceAccount => ({
  id,
  organizationId: ORG,
  name,
  description: "",
  status,
  createdBy: "u-ada",
  createdAt: "2026-11-18T10:00:00.000Z",
  updatedAt: "2026-11-18T10:00:00.000Z",
});

describe("people", () => {
  it("joins Polis's memberships with Pistis's profiles", () => {
    const rows = people(
      [
        membership("user", "u-ada", ["owner"]),
        membership("user", "u-unknown-1234", ["member"]),
      ],
      [user("u-ada", "Ada Lovelace", "ada@example.com")],
    );
    expect(rows.map((row) => [row.name, row.detail, row.roles])).toEqual([
      ["Ada Lovelace", "ada@example.com", ["owner"]],
      ["Unknown user u-unknow", null, ["member"]],
    ]);
  });
});

describe("service accounts", () => {
  const accounts = [
    account("sa-bot", "ci-bot"),
    account("sa-new", "new-bot"),
    account("sa-off", "old-bot", "disabled"),
  ];
  const memberships = [
    membership("service_account", "sa-bot", ["member"]),
    membership("service_account", "sa-off", ["member"]),
  ];

  it("shows every account with its membership, if any", () => {
    expect(
      serviceAccountRows(accounts, memberships).map((row) => [
        row.account.name,
        row.membership?.roles,
      ]),
    ).toEqual([
      ["ci-bot", ["member"]],
      ["new-bot", undefined],
      ["old-bot", ["member"]],
    ]);
  });

  it("only those with a membership can get a project role", () => {
    expect(
      serviceAccountMembers(serviceAccountRows(accounts, memberships)).map(
        (m) => [m.name, m.disabled],
      ),
    ).toEqual([
      ["ci-bot", false],
      ["old-bot", true],
    ]);
  });

  it("runs tasks only when active and with a role in the project", () => {
    expect(
      runnableServiceAccounts(accounts, [
        grant("service_account", "sa-bot", "editor"),
        grant("service_account", "sa-off", "editor"),
        grant("user", "sa-new", "editor"),
      ]).map((a) => a.name),
    ).toEqual(["ci-bot"]);
  });
});

describe("project access", () => {
  const members = people(
    [
      membership("user", "u-ada", ["owner"]),
      membership("user", "u-grace", ["viewer"]),
    ],
    [user("u-ada", "Ada"), user("u-grace", "Grace")],
  );

  it("names who holds each grant, and who has none yet", () => {
    const grants = [
      grant("user", "u-grace", "viewer"),
      grant("user", "u-gone", "editor"),
    ];
    expect(
      projectAccess(grants, members).map((row) => row.member?.name ?? null),
    ).toEqual(["Grace", null]);
    // Ada owns the organization: admin in every project already.
    expect(withoutProjectRole(members, grants).map((m) => m.name)).toEqual([]);
    expect(withoutProjectRole(members, []).map((m) => m.name)).toEqual([
      "Grace",
    ]);
  });

  it("offers only the roles Polis allows", () => {
    expect(
      grantableProjectRoles({ subjectType: "user", roles: ["member"] }),
    ).toEqual(["approver", "editor", "viewer"]);
    expect(
      grantableProjectRoles({ subjectType: "user", roles: ["viewer"] }),
    ).toEqual(["viewer"]);
    expect(
      grantableProjectRoles({
        subjectType: "service_account",
        roles: ["member"],
      }),
    ).toEqual(["editor", "viewer"]);
    expect(
      grantableProjectRoles({
        subjectType: "service_account",
        roles: ["viewer"],
      }),
    ).toEqual(["viewer"]);
  });
});
