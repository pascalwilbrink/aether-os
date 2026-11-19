import type { components } from "./api/generated/kairos-api";

type Schemas = components["schemas"];
export type AutomationRequest = Schemas["AutomationRequest"];
export type Automation = Schemas["AutomationResponse"];
export type AutomationRun = Schemas["AutomationRunResponse"];
export type IssueEvent = Schemas["GitHubIssueEventType"];
export type Permission = Schemas["RepositoryPermission"];

export const EVENTS: { value: IssueEvent; label: string }[] = [
  { value: "github.issue.opened", label: "An issue is opened" },
  { value: "github.issue.labeled", label: "An issue is labelled" },
  { value: "github.issue-comment.created", label: "Someone comments on an issue" },
];

export const PERMISSIONS: { value: Permission; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "maintain", label: "Maintain" },
  { value: "write", label: "Write (default)" },
  { value: "triage", label: "Triage" },
  { value: "read", label: "Read" },
  { value: "any", label: "Anyone, even without access" },
];

/** The fields a task's text can use (Kairos fills them in). */
export const FIELDS = ["issue.number", "issue.title", "issue.url", "repository", "author", "label"];

/** The automation form's fields, as text. */
export type AutomationFields = Record<string, string>;

/** The form's fields for an automation (or a new one's defaults). */
export function fieldsOf(automation?: Automation): AutomationFields {
  if (!automation) {
    return {
      kind: "task",
      event: "github.issue.opened",
      minimumPermission: "write",
      workInRepository: "on",
      title: "Fix #{{issue.number}}: {{issue.title}}",
      instructions: "Fix the issue {{issue.url}} in {{repository}}, reported by {{author}}.",
    };
  }
  const { trigger, action } = automation;
  return {
    name: automation.name,
    description: automation.description,
    event: trigger.event,
    repositoryLinkId: trigger.repositoryLinkId ?? "",
    label: trigger.label ?? "",
    minimumPermission: trigger.minimumPermission ?? "write",
    includePullRequests: trigger.includePullRequests ? "on" : "",
    includeAetherOs: trigger.includeAetherOs ? "on" : "",
    kind: action.template ? "template" : "task",
    agentId: action.task?.agentId ?? "",
    title: action.task?.title ?? "",
    instructions: action.task?.instructions ?? "",
    templateId: action.template?.templateId ?? "",
    templateVersion: action.template?.version ? String(action.template.version) : "",
    inputs: Object.entries(action.template?.inputs ?? {})
      .map(([name, value]) => `${name}=${value}`)
      .join("\n"),
    serviceAccountId: action.serviceAccountId,
    workInRepository: action.workInRepository === false ? "" : "on",
    review: (action.reviewArtifactKinds ?? []).length > 0 ? "all" : "",
  };
}

/** The request for the form's fields, or what's wrong with them. */
export function requestOf(fields: AutomationFields): { request: AutomationRequest } | { error: string } {
  const value = (name: string) => (fields[name] ?? "").trim();
  const on = (name: string) => value(name) === "on";
  if (!value("name")) return { error: "Give the automation a name." };
  if (!value("serviceAccountId")) return { error: "Choose the service account its tasks run as." };
  const event = value("event") as IssueEvent;
  if (!EVENTS.some((entry) => entry.value === event)) return { error: "Choose what fires it." };
  const permission = (value("minimumPermission") || "write") as Permission;
  if (!PERMISSIONS.some((entry) => entry.value === permission)) return { error: "Choose who may fire it." };

  let task: AutomationRequest["action"]["task"];
  let template: AutomationRequest["action"]["template"];
  if (value("kind") === "template") {
    if (!value("templateId")) return { error: "Choose a template." };
    const version = value("templateVersion");
    if (version && !/^[1-9][0-9]*$/.test(version)) return { error: "The template version is a whole number." };
    const inputs: Record<string, string> = {};
    for (const line of value("inputs").split("\n")) {
      if (!line.trim()) continue;
      const at = line.indexOf("=");
      if (at <= 0) return { error: `Write each input as name=value ("${line.trim()}").` };
      inputs[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    template = { templateId: value("templateId"), version: version ? Number(version) : null, inputs };
  } else {
    if (!value("agentId")) return { error: "Choose an agent." };
    if (!value("title") || !value("instructions")) return { error: "Give the task a title and instructions." };
    task = { agentId: value("agentId"), title: value("title"), instructions: value("instructions") };
  }
  return {
    request: {
      name: value("name"),
      description: value("description"),
      trigger: {
        type: "github.issue",
        event,
        repositoryLinkId: value("repositoryLinkId") || null,
        label: value("label") || null,
        minimumPermission: permission,
        includePullRequests: on("includePullRequests"),
        includeAetherOs: on("includeAetherOs"),
      },
      action: {
        ...(task ? { task } : { template }),
        serviceAccountId: value("serviceAccountId"),
        workInRepository: on("workInRepository"),
        reviewArtifactKinds: value("review") === "all" ? ["*"] : [],
      },
    },
  };
}

/** What fires an automation, in a sentence. */
export function triggerSummary(trigger: Automation["trigger"], repositoryName: string | null): string {
  const where = repositoryName ?? "any linked repository";
  const what =
    trigger.event === "github.issue.labeled"
      ? `an issue in ${where} is labelled ${trigger.label ? `“${trigger.label}”` : "(any label)"}`
      : trigger.event === "github.issue-comment.created"
        ? `someone comments on an issue in ${where}`
        : `an issue is opened in ${where}`;
  const label = trigger.label && trigger.event !== "github.issue.labeled" ? ` with the label “${trigger.label}”` : "";
  const who =
    trigger.minimumPermission === "any"
      ? "by anyone"
      : `by someone with ${trigger.minimumPermission ?? "write"} access or more`;
  return `When ${what}${label}, ${who}.`;
}

const STATUS: Record<Automation["status"], { label: string; classes: string }> = {
  active: { label: "Active", classes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  paused: { label: "Paused", classes: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  archived: { label: "Archived", classes: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
};
export const automationStatus = (status: Automation["status"]) => STATUS[status];

const RUN: Record<AutomationRun["status"], string> = {
  requested: "Requested",
  created: "Task created",
  rejected: "Refused",
};
export const runStatusLabel = (status: AutomationRun["status"]) => RUN[status];
