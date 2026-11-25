import { newItemOf, type NewKnowledgeItem } from "./knowledge";

/**
 * The copilot on project pages (docs/interaction.md, "Built: the
 * copilot"): what it remembers per project, the pages it may open, and the
 * drafts it hands to the person. Pure, so it can be tested and used in the
 * browser.
 */

export interface ProjectRef {
  organizationId: string;
  projectId: string;
}

/** What the browser remembers per project: the agent and its session. */
export interface CopilotMemory {
  agentId: string;
  sessionId: string | null;
}

export const copilotStorageKey = (projectId: string) => `iris-copilot:${projectId}`;

/** The remembered copilot, or null when there's none or it's unreadable. */
export function copilotMemoryOf(raw: string | null): CopilotMemory | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CopilotMemory>;
    return typeof value.agentId === "string"
      ? {
          agentId: value.agentId,
          sessionId: typeof value.sessionId === "string" ? value.sessionId : null,
        }
      : null;
  } catch {
    return null;
  }
}

/** The agent the copilot talks to: the remembered one while it's offered, else the first. */
export function copilotAgentOf(
  remembered: string | undefined,
  agents: readonly { id: string }[],
): string | null {
  return agents.find((agent) => agent.id === remembered)?.id ?? agents[0]?.id ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The project's pages the copilot may open, and whether each takes an ID. */
const PAGES: Record<string, "list" | "item" | "both"> = {
  tasks: "item",
  knowledge: "both",
  sessions: "both",
  automations: "item",
  templates: "item",
};

/**
 * Where `open_page` goes: a page of this project (`""` for the project,
 * `tasks/{id}`, `knowledge`, …), or an error the agent is told. Anything
 * else (another project, outside Iris, `..`) is refused.
 */
export function copilotHref(
  project: ProjectRef,
  path: string,
): { href: string } | { error: string } {
  const base = `/orgs/${project.organizationId}/projects/${project.projectId}`;
  const trimmed = path.trim().replace(/^\/+|\/+$/g, "");
  const relative = trimmed.startsWith(base.slice(1))
    ? trimmed.slice(base.length).replace(/^\/+/, "")
    : trimmed;
  if (relative === "") return { href: base };
  const [page, id, ...rest] = relative.split("/");
  const kind = PAGES[page];
  const valid =
    kind !== undefined &&
    rest.length === 0 &&
    (id === undefined ? kind !== "item" : kind !== "list" && UUID.test(id));
  return valid
    ? { href: `${base}/${relative}` }
    : {
        error: `"${path}" isn't a page of this project. Use "" for the project, or tasks/{id}, knowledge, knowledge/{id}, sessions, sessions/{id}, automations/{id} or templates/{id}.`,
      };
}

/** A task the copilot drafted, for the new-task form. */
export interface TaskDraft {
  title: string;
  description?: string;
  expectedOutcome?: string;
  requirements?: string[];
  constraints?: string[];
}

const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
/** Lines from a list, or from text a line each (the form's own shape). */
const lines = (value: unknown) =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [])
        .map((line) => text(line, 2000))
        .filter(Boolean)
        .slice(0, 50);

/** The draft as the form's values (requirements and constraints a line each). */
export function taskDraftValues(draft: unknown): Record<string, string> | null {
  if (typeof draft !== "object" || draft === null) return null;
  const value = draft as Record<string, unknown>;
  const title = text(value.title, 200);
  if (!title) return null;
  return {
    title,
    description: text(value.description, 20000),
    expectedOutcome: text(value.expectedOutcome, 5000),
    requirements: lines(value.requirements).join("\n"),
    constraints: lines(value.constraints).join("\n"),
  };
}

/** The project page with the new-task form filled in from a draft. */
export function taskDraftHref(project: ProjectRef, draft: TaskDraft): string {
  const values = taskDraftValues(draft) ?? { title: "" };
  const kept = Object.fromEntries(Object.entries(values).filter(([, entry]) => entry));
  return `/orgs/${project.organizationId}/projects/${project.projectId}?draft=${encodeURIComponent(JSON.stringify(kept))}#new-task`;
}

/** The form's values from the `draft` search parameter, or nothing. */
export function taskDraftParam(param: string | string[] | undefined): Record<string, string> | undefined {
  if (typeof param !== "string") return undefined;
  try {
    return taskDraftValues(JSON.parse(param)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** A knowledge item the copilot drafted, checked as the Knowledge page's form checks it. */
export function knowledgeDraftOf(
  draft: unknown,
): { request: NewKnowledgeItem } | { error: string } {
  const value = (typeof draft === "object" && draft !== null ? draft : {}) as Record<string, unknown>;
  return newItemOf({
    type: typeof value.type === "string" ? value.type : "",
    title: text(value.title, 200),
    body: text(value.body, 50000),
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string").join(",")
      : "",
  });
}

/** What a task's page tells the copilot: what the person sees, in short. */
export function taskPageContext(
  task: {
    id: string;
    title: string;
    status: string;
    failureReason?: string | null;
    pausedFor?: string | null;
    description?: string | null;
    expectedOutcome?: string | null;
  },
  executions: readonly {
    number: number;
    status: string;
    failureReason: string | null;
    error: string | null;
    summary: string | null;
  }[],
): Record<string, unknown> {
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    ...(task.failureReason ? { failureReason: task.failureReason } : {}),
    ...(task.pausedFor ? { pausedFor: `the ${task.pausedFor} budget ran out` } : {}),
    ...(task.description ? { description: task.description.slice(0, 4000) } : {}),
    ...(task.expectedOutcome ? { expectedOutcome: task.expectedOutcome.slice(0, 2000) } : {}),
    // The latest ten, newest first.
    executions: [...executions]
      .sort((a, b) => b.number - a.number)
      .slice(0, 10)
      .map((execution) => ({
        number: execution.number,
        status: execution.status,
        ...(execution.failureReason ? { failureReason: execution.failureReason } : {}),
        ...(execution.error ? { error: execution.error.slice(0, 2000) } : {}),
        ...(execution.summary ? { summary: execution.summary.slice(0, 1000) } : {}),
      })),
  };
}
