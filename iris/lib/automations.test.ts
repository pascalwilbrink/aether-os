import { describe, expect, it } from "vitest";

import { fieldsOf, requestOf, triggerSummary, type Automation } from "./automations";

const fields = (overrides: Record<string, string> = {}) => ({
  ...fieldsOf(),
  name: "Fix bugs",
  agentId: "agent-1",
  serviceAccountId: "sa-1",
  ...overrides,
});

describe("automations", () => {
  it("builds a task automation's request from the form, with safe defaults", () => {
    expect(requestOf(fields())).toEqual({
      request: {
        name: "Fix bugs",
        description: "",
        trigger: {
          type: "github.issue",
          event: "github.issue.opened",
          repositoryLinkId: null,
          label: null,
          minimumPermission: "write",
          includePullRequests: false,
          includeAetherOs: false,
        },
        action: {
          task: {
            agentId: "agent-1",
            title: "Fix #{{issue.number}}: {{issue.title}}",
            instructions: "Fix the issue {{issue.url}} in {{repository}}, reported by {{author}}.",
          },
          serviceAccountId: "sa-1",
          workInRepository: true,
          reviewArtifactKinds: [],
        },
      },
    });
  });

  it("builds a template automation with its inputs, and checks the form", () => {
    const result = requestOf(
      fields({
        kind: "template",
        templateId: "template-1",
        templateVersion: "2",
        inputs: "issue = {{repository}}#{{issue.number}}\n\nlabel=bug",
        review: "all",
        workInRepository: "",
      }),
    );
    expect(result).toMatchObject({
      request: {
        action: {
          template: {
            templateId: "template-1",
            version: 2,
            inputs: { issue: "{{repository}}#{{issue.number}}", label: "bug" },
          },
          workInRepository: false,
          reviewArtifactKinds: ["*"],
        },
      },
    });
    expect("request" in result && result.request.action.task).toBeUndefined();
    expect(requestOf(fields({ name: "" }))).toEqual({ error: "Give the automation a name." });
    expect(requestOf(fields({ kind: "template" }))).toEqual({ error: "Choose a template." });
    expect(requestOf(fields({ kind: "template", templateId: "t", inputs: "no equals" }))).toEqual({
      error: 'Write each input as name=value ("no equals").',
    });
    expect(requestOf(fields({ kind: "template", templateId: "t", templateVersion: "x" }))).toEqual({
      error: "The template version is a whole number.",
    });
  });

  it("round-trips an automation through the form", () => {
    const automation = {
      ...requestOf(fields({ label: "aether", includeAetherOs: "on" })),
      name: "Fix bugs",
    } as unknown as { request: Automation };
    const stored = { ...automation.request, status: "active" } as Automation;
    expect(requestOf(fieldsOf(stored))).toEqual({ request: (automation as { request: unknown }).request });
  });

  it("says what fires it", () => {
    const trigger = { type: "github.issue", event: "github.issue.labeled", label: "aether" } as Automation["trigger"];
    expect(triggerSummary(trigger, "acme/api")).toBe(
      "When an issue in acme/api is labelled “aether”, by someone with write access or more.",
    );
    expect(triggerSummary({ ...trigger, event: "github.issue.opened", minimumPermission: "any" }, null)).toBe(
      "When an issue is opened in any linked repository with the label “aether”, by anyone.",
    );
  });
});
