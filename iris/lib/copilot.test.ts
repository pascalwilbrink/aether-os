import { describe, expect, it } from "vitest";

import {
  copilotAgentOf,
  copilotHref,
  copilotMemoryOf,
  knowledgeDraftOf,
  taskDraftHref,
  taskDraftParam,
  taskPageContext,
} from "./copilot";

const project = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
};
const base = `/orgs/${project.organizationId}/projects/${project.projectId}`;
const id = "33333333-3333-4333-8333-333333333333";

describe("what the browser remembers", () => {
  it("reads the agent and session, and nothing from what it can't read", () => {
    expect(copilotMemoryOf('{"agentId":"a","sessionId":"s"}')).toEqual({
      agentId: "a",
      sessionId: "s",
    });
    expect(copilotMemoryOf('{"agentId":"a"}')).toEqual({ agentId: "a", sessionId: null });
    expect(copilotMemoryOf("not json")).toBeNull();
    expect(copilotMemoryOf('{"sessionId":"s"}')).toBeNull();
    expect(copilotMemoryOf(null)).toBeNull();
  });

  it("keeps the remembered agent while it's offered, else takes the first", () => {
    const agents = [{ id: "a" }, { id: "b" }];
    expect(copilotAgentOf("b", agents)).toBe("b");
    expect(copilotAgentOf("gone", agents)).toBe("a");
    expect(copilotAgentOf(undefined, [])).toBeNull();
  });
});

describe("open_page", () => {
  it("opens the project's own pages", () => {
    expect(copilotHref(project, "")).toEqual({ href: base });
    expect(copilotHref(project, `tasks/${id}`)).toEqual({ href: `${base}/tasks/${id}` });
    expect(copilotHref(project, "/knowledge/")).toEqual({ href: `${base}/knowledge` });
    expect(copilotHref(project, `${base}/sessions/${id}`)).toEqual({
      href: `${base}/sessions/${id}`,
    });
  });

  it("refuses anything else", () => {
    for (const path of [
      "tasks",
      "tasks/not-an-id",
      `tasks/${id}/executions`,
      "../../other",
      "https://example.com",
      "members",
      `/orgs/${project.organizationId}/projects/${id}/tasks/${id}`,
    ]) {
      expect(copilotHref(project, path)).toHaveProperty("error");
    }
  });
});

describe("a drafted task", () => {
  it("goes to the new-task form through the URL and comes back as its values", () => {
    const href = taskDraftHref(project, {
      title: " Fix the login ",
      description: "It fails on Safari.",
      requirements: ["REQ-1: works on Safari", " "],
    });
    expect(href.startsWith(`${base}?draft=`)).toBe(true);
    expect(href.endsWith("#new-task")).toBe(true);
    const param = decodeURIComponent(href.slice(href.indexOf("=") + 1, href.indexOf("#")));
    expect(taskDraftParam(param)).toEqual({
      title: "Fix the login",
      description: "It fails on Safari.",
      expectedOutcome: "",
      requirements: "REQ-1: works on Safari",
      constraints: "",
    });
  });

  it("is nothing without a title, or when it isn't one", () => {
    expect(taskDraftParam('{"description":"x"}')).toBeUndefined();
    expect(taskDraftParam("{")).toBeUndefined();
    expect(taskDraftParam(["a", "b"])).toBeUndefined();
    expect(taskDraftParam(undefined)).toBeUndefined();
  });
});

describe("a drafted knowledge item", () => {
  it("is checked as the Knowledge page checks it", () => {
    expect(
      knowledgeDraftOf({ type: "decision", title: "Postgres", body: "We use it.", tags: ["db", "db"] }),
    ).toEqual({ request: { type: "decision", title: "Postgres", body: "We use it.", tags: ["db"] } });
    expect(knowledgeDraftOf({ type: "document", title: "x", body: "y" })).toHaveProperty("error");
    expect(knowledgeDraftOf({ type: "fact", title: "", body: "y" })).toHaveProperty("error");
    expect(knowledgeDraftOf(null)).toHaveProperty("error");
  });
});

describe("a task's page for the copilot", () => {
  it("says what the person sees, latest executions first", () => {
    const context = taskPageContext(
      {
        id,
        title: "Fix the login",
        status: "failed",
        failureReason: "verification_failed",
        pausedFor: null,
        description: "It fails on Safari.",
        expectedOutcome: null,
      },
      [
        { number: 1, status: "failed", failureReason: "error", error: "Boom", summary: null },
        { number: 2, status: "failed", failureReason: null, error: null, summary: "Tried twice" },
      ],
    );
    expect(context).toEqual({
      taskId: id,
      title: "Fix the login",
      status: "failed",
      failureReason: "verification_failed",
      description: "It fails on Safari.",
      executions: [
        { number: 2, status: "failed", summary: "Tried twice" },
        { number: 1, status: "failed", failureReason: "error", error: "Boom" },
      ],
    });
  });
});
