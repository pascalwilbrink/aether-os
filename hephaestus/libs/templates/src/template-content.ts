import type { ApiTypes } from '@hephaestus/core';

export type TemplateContent = ApiTypes.TaskTemplateContent;
export type EffectiveTemplate = ApiTypes.EffectiveTaskTemplate;

/** `{{name}}`, with optional spaces inside the braces. */
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** Why a template version (or the inputs for one) isn't usable. */
export class TemplateProblem extends Error {}

/**
 * A version's effective content: what a task from it gets. Without
 * `extends`, its own content, which must be complete. With it, built on the
 * organization template's effective content: its own title and agent if
 * given, its instructions appended, inputs and criteria only added (a name
 * or key twice is a problem: a project can't redefine the organization's),
 * review kinds added. Placeholders must name declared inputs.
 */
export function effectiveTemplate(
  content: TemplateContent,
  base?: EffectiveTemplate,
): EffectiveTemplate {
  const title = content.title ?? base?.title;
  const instructions = base
    ? content.instructions
      ? `${base.instructions}\n\n${content.instructions}`
      : base.instructions
    : content.instructions;
  const agentId = content.agentId ?? base?.agentId;
  if (!title || !instructions || !agentId) {
    throw new TemplateProblem(
      'A template needs a title, instructions and an agent (its own, or from the template it extends)',
    );
  }

  const inputs = [
    ...(base?.inputs ?? []),
    ...(content.inputs ?? []).map((input) => ({
      ...input,
      required: input.required ?? true,
    })),
  ];
  const duplicateInput = firstDuplicate(inputs.map((input) => input.name));
  if (duplicateInput) {
    throw new TemplateProblem(`The input ${duplicateInput} is declared twice`);
  }
  const acceptanceCriteria = [
    ...(base?.acceptanceCriteria ?? []),
    ...(content.acceptanceCriteria ?? []),
  ];
  const duplicateKey = firstDuplicate(acceptanceCriteria.map((c) => c.key));
  if (duplicateKey) {
    throw new TemplateProblem(
      `The acceptance criterion ${duplicateKey} is defined twice`,
    );
  }

  const declared = new Set(inputs.map((input) => input.name));
  const undeclared = [
    ...placeholdersIn(title),
    ...placeholdersIn(instructions),
  ].filter((name) => !declared.has(name));
  if (undeclared.length > 0) {
    throw new TemplateProblem(
      `Placeholders without an input: ${[...new Set(undeclared)].join(', ')}`,
    );
  }

  return {
    title,
    instructions,
    agentId,
    inputs,
    acceptanceCriteria,
    review: {
      artifactKinds: [
        ...new Set([
          ...(base?.review.artifactKinds ?? []),
          ...(content.review?.artifactKinds ?? []),
        ]),
      ],
    },
  };
}

/**
 * The title and instructions with the inputs filled in. Every required
 * input needs a value, and only declared inputs are accepted; an optional
 * input left out becomes empty text.
 */
export function render(
  template: EffectiveTemplate,
  values: Record<string, string>,
): { title: string; instructions: string } {
  const declared = new Map(template.inputs.map((input) => [input.name, input]));
  const unknown = Object.keys(values).filter((name) => !declared.has(name));
  if (unknown.length > 0) {
    throw new TemplateProblem(`Unknown inputs: ${unknown.join(', ')}`);
  }
  const missing = template.inputs
    .filter((input) => input.required !== false && !values[input.name])
    .map((input) => input.name);
  if (missing.length > 0) {
    throw new TemplateProblem(`Missing inputs: ${missing.join(', ')}`);
  }
  const fill = (text: string) =>
    text.replace(PLACEHOLDER, (_, name: string) => values[name] ?? '');
  const title = fill(template.title).trim();
  if (!title || title.length > 200) {
    throw new TemplateProblem(
      'The title with its inputs filled in must be 1 to 200 characters',
    );
  }
  return { title, instructions: fill(template.instructions) };
}

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function firstDuplicate(values: string[]): string | undefined {
  return values.find((value, i) => values.indexOf(value) !== i);
}
