import { describe, expect, it } from "vitest";

import type { Membership, Person, ProjectMembership } from "./api/polis";
import {
  assignableRoles,
  grantableProjectRoles,
  highestRole,
  members,
  projectGrants,
  withoutAccess,
  withoutProjectRole,
} from "./members";

const membership = (subject: string, roles: Membership["roles"]): Membership => ({
  id: `m-${subject}`,
  organizationId: "o",
  subjectType: "user",
  subject,
  roles,
  createdBy: "x",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const person = (id: string, userId: string | null, name = id): Person => ({
  id,
  organizationId: "o",
  name,
  email: `${id}@example.com`,
  description: "",
  role: null,
  gender: null,
  departmentIds: [],
  userId,
  createdBy: "x",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  version: 1,
});

const grant = (subject: string): ProjectMembership => ({
  id: `g-${subject}`,
  organizationId: "o",
  projectId: "p",
  subjectType: "user",
  subject,
  role: "editor",
  createdBy: "x",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("members", () => {
  it("names members from Pistis, then their person, then their ID, sorted", () => {
    const list = members(
      [membership("u1", ["owner"]), membership("u2", ["member"]), membership("u3abcdefgh", ["viewer"])],
      [{ id: "u1", displayName: "Zed", email: "zed@example.com", status: "active" }],
      [person("p2", "u2", "Ada")],
    );
    expect(list.map((m) => [m.name, m.personId])).toEqual([
      ["Ada", "p2"],
      ["Unknown user u3abcdef", null],
      ["Zed", null],
    ]);
  });

  it("finds people who signed up but have no access", () => {
    expect(
      withoutAccess(
        [person("a", "u1"), person("b", "u2"), person("c", null)],
        [membership("u1", ["member"])],
      ).map((p) => p.id),
    ).toEqual(["b"]);
  });

  it("offers owner only to owners, and shows the highest role", () => {
    expect(assignableRoles(["admin"]).map((r) => r.role)).toEqual([
      "admin",
      "member",
      "viewer",
    ]);
    expect(assignableRoles(["owner"])[0].role).toBe("owner");
    expect(highestRole(["viewer", "admin"])).toBe("admin");
  });

  it("offers project roles to members without one, within their cap", () => {
    const people = members(
      [membership("u1", ["admin"]), membership("u2", ["member"]), membership("u3", ["viewer"])],
      [],
      [],
    );
    expect(withoutProjectRole(people, [grant("u2")]).map((m) => m.userId)).toEqual(["u3"]);
    expect(grantableProjectRoles("user", ["viewer"])).toEqual(["viewer"]);
    expect(grantableProjectRoles("user", ["member"])).toEqual(["approver", "editor", "viewer"]);
    expect(grantableProjectRoles("service_account", ["member"])).toEqual(["editor", "viewer"]);
  });

  it("names a project's grants", () => {
    const people = members([membership("u1", ["member"])], [], [person("p", "u1", "Ada")]);
    expect(
      projectGrants(
        [grant("u1"), { ...grant("sa1"), subjectType: "service_account" }],
        people,
        [
          {
            id: "sa1",
            organizationId: "o",
            name: "Triage bot",
            description: "",
            status: "active",
            createdBy: "x",
            createdAt: "",
            updatedAt: "",
          },
        ],
      ).map((g) => [g.name, g.detail]),
    ).toEqual([
      ["Ada", "p@example.com"],
      ["Triage bot", "Service account"],
    ]);
  });
});
