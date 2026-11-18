import { describe, expect, it } from "vitest";

import type { Repository, RepositoryLink } from "./api/proxenos";
import { connectResult, coverageLabel, linkableRepositories, repositoryChoices } from "./github";

const repository = (id: string, fullName: string, status: Repository["status"] = "available"): Repository => ({
  id,
  organizationId: "org",
  installationId: "installation",
  externalId: id,
  fullName,
  defaultBranch: "main",
  private: true,
  status,
  createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z",
});

const link = (id: string, repo: Repository): RepositoryLink => ({
  id,
  organizationId: "org",
  projectId: "project",
  repository: repo,
  createdBy: "user-1",
  createdAt: "2026-11-18T00:00:00.000Z",
});

describe("connectResult", () => {
  it("says GitHub is connected", () => {
    expect(connectResult("connected", undefined)).toEqual({ ok: true, message: expect.stringContaining("connected") });
  });

  it("explains each failure, and anything else generically", () => {
    expect(connectResult("failed", "installation-taken")).toEqual({
      ok: false,
      message: "That GitHub installation is connected to another organization already.",
    });
    expect(connectResult("failed", "something-new")).toEqual({
      ok: false,
      message: "Connecting GitHub failed. Start again.",
    });
  });

  it("shows nothing on an ordinary visit", () => {
    expect(connectResult(undefined, undefined)).toBeNull();
    expect(connectResult("other", "expired")).toBeNull();
  });
});

describe("repositories", () => {
  const api = repository("1", "acme/api");
  const web = repository("2", "acme/web");
  const docs = repository("3", "acme/docs");
  const gone = repository("4", "acme/old", "removed");

  it("offers the available repositories a project hasn't linked, by name", () => {
    expect(linkableRepositories([web, gone, api, docs], [link("l1", api)]).map((r) => r.fullName)).toEqual([
      "acme/docs",
      "acme/web",
    ]);
  });

  it("lets tasks choose among the project's links", () => {
    expect(repositoryChoices([link("l2", web), link("l1", api), link("l3", gone)])).toEqual([
      { id: "l1", name: "acme/api" },
      { id: "l2", name: "acme/web" },
    ]);
  });

  it("describes what an installation covers", () => {
    expect(coverageLabel({ repositorySelection: "all" })).toBe("all repositories");
    expect(coverageLabel({ repositorySelection: "selected" })).toBe("selected repositories");
  });
});
