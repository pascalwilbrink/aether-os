import type { ApiSchema } from "./api";

export type TaskItem = ApiSchema<"TaskItem">;
export type TaskDeliverable = ApiSchema<"TaskDeliverable">;
export type DeliverableKind = TaskDeliverable["kind"];

/** The kinds a deliverable can be, as people read them. */
export const DELIVERABLE_KINDS: { kind: DeliverableKind; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "json", label: "JSON" },
  { kind: "file", label: "File" },
  { kind: "pull_request", label: "Pull request" },
];

export const deliverableKindLabel = (kind: DeliverableKind) =>
  DELIVERABLE_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;

/** Hephaestus's limits on a task's brief. */
export const BRIEF_LIMITS = { items: 50, deliverables: 20 } as const;

const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const DELIVERABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Requirements or constraints typed one per line: `KEY: what` keeps its
 * key, a line without one gets the next free `PREFIX-n`; list markers
 * (`-`, `*`) and empty lines are left out.
 */
export function itemsFromText(
  text: string,
  prefix: string,
  taken: ReadonlySet<string> = new Set(),
): { items: TaskItem[] } | { error: string } {
  const lines = text
    .split(/\r?\n/)
    .map((raw) => raw.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const keyed = /^([A-Za-z0-9][A-Za-z0-9._-]{0,99}):\s+(.+)$/.exec(line);
      return keyed
        ? { key: keyed[1], description: keyed[2] }
        : { key: null, description: line };
    });
  // Typed keys first, so a numbered line never takes one of them.
  const used = new Set(taken);
  for (const line of lines) {
    if (line.key === null) continue;
    if (used.has(line.key)) {
      return { error: `The key ${line.key} is used twice.` };
    }
    used.add(line.key);
  }
  const items: TaskItem[] = [];
  let next = 1;
  for (const line of lines) {
    let key = line.key;
    const description = line.description;
    if (key === null) {
      while (used.has(`${prefix}-${next}`)) next++;
      key = `${prefix}-${next}`;
    }
    if (description.length > 4000) {
      return { error: `${key} is longer than 4000 characters.` };
    }
    used.add(key);
    items.push({ key, description });
  }
  if (items.length > BRIEF_LIMITS.items) {
    return { error: `At most ${BRIEF_LIMITS.items} lines.` };
  }
  return { items };
}

/** The lines `itemsFromText` reads back, for a form that starts from a brief. */
export const textFromItems = (items: readonly TaskItem[]) =>
  items.map((item) => `${item.key}: ${item.description}`).join("\n");

/**
 * The deliverables editor's rows (sent as JSON), checked as Hephaestus
 * will: a key and a description each, keys unique, one primary at most,
 * a path only on a file. Empty rows are left out.
 */
export function deliverablesFromJson(
  json: string | undefined,
): { deliverables: TaskDeliverable[] } | { error: string } {
  if (!json) return { deliverables: [] };
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return { error: "The deliverables couldn't be read." };
  }
  if (!Array.isArray(rows)) {
    return { error: "The deliverables couldn't be read." };
  }
  const deliverables: TaskDeliverable[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const key = String(row.key ?? "").trim();
    const description = String(row.description ?? "").trim();
    const kind = String(row.kind ?? "") as DeliverableKind;
    const path = String(row.path ?? "").trim();
    if (!key && !description) continue;
    if (!DELIVERABLE_KEY.test(key)) {
      return {
        error: `A deliverable's key is letters, digits, dots, hyphens and underscores (at most 64), e.g. report; not "${key}".`,
      };
    }
    if (!description) return { error: `Describe the deliverable ${key}.` };
    if (!DELIVERABLE_KINDS.some((entry) => entry.kind === kind)) {
      return { error: `Choose what kind of deliverable ${key} is.` };
    }
    if (path && kind !== "file") {
      return { error: `Only a file deliverable has a name (${key}).` };
    }
    if (deliverables.some((d) => d.key === key)) {
      return { error: `The deliverable ${key} is listed twice.` };
    }
    deliverables.push({
      key,
      kind,
      description,
      ...(row.primary === true ? { primary: true } : {}),
      ...(path ? { path } : {}),
    });
  }
  if (deliverables.filter((d) => d.primary).length > 1) {
    return { error: "At most one deliverable is the main outcome." };
  }
  if (deliverables.length > BRIEF_LIMITS.deliverables) {
    return { error: `At most ${BRIEF_LIMITS.deliverables} deliverables.` };
  }
  return { deliverables };
}

/** A new task's brief from its form's fields, or what's wrong. */
export function briefFromForm(fields: Record<string, string | undefined>):
  | {
      brief: {
        description: string;
        expectedOutcome?: string;
        requirements?: TaskItem[];
        constraints?: TaskItem[];
        deliverables?: TaskDeliverable[];
      };
    }
  | { error: string } {
  const description = (fields.description ?? "").trim();
  if (!description) {
    return { error: "Describe the task: what needs to be done, and why." };
  }
  const requirements = itemsFromText(fields.requirements ?? "", "REQ");
  if ("error" in requirements) {
    return { error: `Requirements: ${requirements.error}` };
  }
  const constraints = itemsFromText(
    fields.constraints ?? "",
    "CON",
    new Set(requirements.items.map((item) => item.key)),
  );
  if ("error" in constraints) {
    return { error: `Constraints: ${constraints.error}` };
  }
  const deliverables = deliverablesFromJson(fields.deliverables);
  if ("error" in deliverables) return deliverables;
  const expectedOutcome = (fields.expectedOutcome ?? "").trim();
  return {
    brief: {
      description,
      ...(expectedOutcome ? { expectedOutcome } : {}),
      ...(requirements.items.length
        ? { requirements: requirements.items }
        : {}),
      ...(constraints.items.length ? { constraints: constraints.items } : {}),
      ...(deliverables.deliverables.length
        ? { deliverables: deliverables.deliverables }
        : {}),
    },
  };
}

export const isItemKey = (key: string) => KEY.test(key);
