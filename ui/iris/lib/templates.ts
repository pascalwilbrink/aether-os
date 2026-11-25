import type { ApiSchema } from "./api";
import {
  deliverablesFromJson,
  itemsFromText,
  textFromItems,
} from "./task-brief";
import { taskContextOf } from "./tasks";

export type TemplateContent = ApiSchema<"TaskTemplateContent">;
export type TemplateInput = ApiSchema<"TemplateInput">;
export type CriterionRequest = ApiSchema<"AcceptanceCriterionRequest">;

/** The template form's fields, as text (`valuesOf`). */
export type TemplateFields = Record<string, string | undefined>;

/** A row of the criteria editor: checked by a command in the sandbox, or by the reviewer. */
export interface CriterionRow {
  key: string;
  description: string;
  type: "command" | "manual";
  command: string;
}

const INPUT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * A template's inputs typed one per line: `name: what it is`, a `?` after
 * the name for an optional one (`notes?: Anything else`).
 */
export function inputsFromText(
  text: string,
): { inputs: TemplateInput[] } | { error: string } {
  const inputs: TemplateInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(":");
    const head = (at >= 0 ? line.slice(0, at) : line).trim();
    const description = at >= 0 ? line.slice(at + 1).trim() : "";
    const optional = head.endsWith("?");
    const name = optional ? head.slice(0, -1) : head;
    if (!INPUT_NAME.test(name)) {
      return {
        error: `An input's name is a letter then letters, digits or _ (at most 50), e.g. issue; not "${name}".`,
      };
    }
    if (inputs.some((input) => input.name === name)) {
      return { error: `The input ${name} is listed twice.` };
    }
    inputs.push({
      name,
      ...(description ? { description } : {}),
      ...(optional ? { required: false } : {}),
    });
  }
  return { inputs };
}

/** The lines `inputsFromText` reads back. */
export const textFromInputs = (inputs: readonly TemplateInput[]) =>
  inputs
    .map(
      (input) =>
        `${input.name}${input.required === false ? "?" : ""}${input.description ? `: ${input.description}` : ""}`,
    )
    .join("\n");

/** The criteria editor's rows (JSON), checked; empty rows are left out. */
export function criteriaFromJson(
  json: string | undefined,
): { criteria: CriterionRequest[] } | { error: string } {
  if (!json) return { criteria: [] };
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return { error: "The acceptance criteria couldn't be read." };
  }
  if (!Array.isArray(rows)) {
    return { error: "The acceptance criteria couldn't be read." };
  }
  const criteria: CriterionRequest[] = [];
  for (const row of rows as Partial<CriterionRow>[]) {
    const key = String(row.key ?? "").trim();
    const description = String(row.description ?? "").trim();
    const command = String(row.command ?? "").trim();
    if (!key && !description && !command) continue;
    if (!KEY.test(key)) {
      return {
        error: `A criterion's key is letters, digits, dots, hyphens and underscores, e.g. tests-pass; not "${key}".`,
      };
    }
    if (!description) return { error: `Describe the criterion ${key}.` };
    if (criteria.some((criterion) => criterion.key === key)) {
      return { error: `The criterion ${key} is listed twice.` };
    }
    if (row.type === "command") {
      if (!command) return { error: `Give the command that checks ${key}.` };
      criteria.push({ key, description, check: { type: "command", command } });
    } else {
      criteria.push({ key, description, check: { type: "manual" } });
    }
  }
  return { criteria };
}

/** The editor's rows for criteria (artifact checks come from deliverables, so they aren't edited here). */
export function rowsFromCriteria(
  criteria: readonly CriterionRequest[],
): CriterionRow[] {
  return criteria.flatMap((criterion): CriterionRow[] =>
    criterion.check.type === "command"
      ? [
          {
            key: criterion.key,
            description: criterion.description,
            type: "command",
            command: criterion.check.command,
          },
        ]
      : criterion.check.type === "manual"
        ? [
            {
              key: criterion.key,
              description: criterion.description,
              type: "manual",
              command: "",
            },
          ]
        : [],
  );
}

/**
 * A template version's content from its form, or what's wrong. Without
 * `extends`, a title, instructions and an agent are needed (a project
 * template extending an organization one inherits them).
 */
export function templateContentFromForm(
  fields: TemplateFields,
): { content: TemplateContent } | { error: string } {
  const value = (name: string) => (fields[name] ?? "").trim();
  const extendsId = value("extendsTemplateId");
  const extendsVersion = value("extendsVersion");
  if (extendsId && !/^[1-9][0-9]*$/.test(extendsVersion)) {
    return { error: "Choose which version of the template it extends." };
  }
  const title = value("title");
  const instructions = value("instructions");
  const agentId = value("agentId");
  if (!extendsId && (!title || !instructions || !agentId)) {
    return {
      error:
        "A template needs a title, what to do and an agent (unless it extends one that has them).",
    };
  }
  if (title.length > 200)
    return { error: "The title is at most 200 characters." };

  const inputs = inputsFromText(value("inputs"));
  if ("error" in inputs) return { error: `Inputs: ${inputs.error}` };
  const requirements = itemsFromText(value("requirements"), "REQ");
  if ("error" in requirements) {
    return { error: `Requirements: ${requirements.error}` };
  }
  const constraints = itemsFromText(
    value("constraints"),
    "CON",
    new Set(requirements.items.map((item) => item.key)),
  );
  if ("error" in constraints)
    return { error: `Constraints: ${constraints.error}` };
  const deliverables = deliverablesFromJson(fields.deliverables);
  if ("error" in deliverables) return deliverables;
  const criteria = criteriaFromJson(fields.criteria);
  if ("error" in criteria) return criteria;
  const context = taskContextOf(value("context").split(","));
  if ("error" in context) return context;
  const expectedOutcome = value("expectedOutcome");

  return {
    content: {
      ...(title ? { title } : {}),
      ...(instructions ? { instructions } : {}),
      ...(agentId ? { agentId } : {}),
      ...(expectedOutcome ? { expectedOutcome } : {}),
      ...(requirements.items.length
        ? { requirements: requirements.items }
        : {}),
      ...(constraints.items.length ? { constraints: constraints.items } : {}),
      ...(deliverables.deliverables.length
        ? { deliverables: deliverables.deliverables }
        : {}),
      ...(inputs.inputs.length ? { inputs: inputs.inputs } : {}),
      ...(criteria.criteria.length
        ? { acceptanceCriteria: criteria.criteria }
        : {}),
      ...(context.context.length ? { context: context.context } : {}),
      review: { artifactKinds: value("review") === "all" ? ["*"] : [] },
      ...(extendsId
        ? {
            extends: {
              templateId: extendsId,
              version: Number(extendsVersion),
            },
          }
        : {}),
    },
  };
}

/** The form's fields for a version's content (its next version starts from them). */
export function fieldsFromContent(content: TemplateContent): TemplateFields {
  return {
    title: content.title ?? "",
    instructions: content.instructions ?? "",
    agentId: content.agentId ?? "",
    expectedOutcome: content.expectedOutcome ?? "",
    requirements: textFromItems(content.requirements ?? []),
    constraints: textFromItems(content.constraints ?? []),
    deliverables: JSON.stringify(
      (content.deliverables ?? []).map((d) => ({
        key: d.key,
        kind: d.kind,
        description: d.description,
        path: d.path ?? "",
        primary: d.primary ?? false,
      })),
    ),
    inputs: textFromInputs(content.inputs ?? []),
    criteria: JSON.stringify(
      rowsFromCriteria(content.acceptanceCriteria ?? []),
    ),
    context: (content.context ?? []).map((entry) => entry.itemId).join(","),
    review: (content.review?.artifactKinds ?? []).length > 0 ? "all" : "",
    extendsTemplateId: content.extends?.templateId ?? "",
    extendsVersion: content.extends ? String(content.extends.version) : "",
  };
}

/**
 * The template form's fields from what it sent: every checked knowledge
 * item, and the `extends` choice (`<templateId>@<version>`) split in two.
 */
export function templateFieldsOf(
  values: Record<string, string>,
  context: readonly string[],
): TemplateFields {
  const [extendsTemplateId = "", extendsVersion = ""] = (values.extends ?? "")
    .split("@")
    .map((part) => part.trim());
  return {
    ...values,
    context: context.join(","),
    extendsTemplateId,
    extendsVersion,
  };
}
