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
 * given, its description and expected outcome appended, inputs,
 * requirements, constraints, deliverables and criteria only added (a name
 * or key twice is a problem: a project can't redefine the organization's),
 * review kinds added. Placeholders must name declared inputs.
 */
export function effectiveTemplate(
  content: TemplateContent,
  base?: EffectiveTemplate,
): EffectiveTemplate {
  const title = content.title ?? base?.title;
  const description = appended(
    base?.description,
    content.instructions,
  );
  const expectedOutcome =
    appended(base?.expectedOutcome ?? undefined, content.expectedOutcome) ??
    null;
  const agentId = content.agentId ?? base?.agentId;
  if (!title || !description || !agentId) {
    throw new TemplateProblem(
      'A template needs a title, a description and an agent (its own, or from the template it extends)',
    );
  }
  const requirements = [
    ...(base?.requirements ?? []),
    ...(content.requirements ?? []),
  ];
  const constraints = [
    ...(base?.constraints ?? []),
    ...(content.constraints ?? []),
  ];
  const duplicateItem = firstDuplicate(
    [...requirements, ...constraints].map((item) => item.key),
  );
  if (duplicateItem) {
    throw new TemplateProblem(
      `The requirement or constraint ${duplicateItem} is defined twice`,
    );
  }
  const deliverables = [
    ...(base?.deliverables ?? []),
    ...(content.deliverables ?? []),
  ];
  const duplicateDeliverable = firstDuplicate(deliverables.map((d) => d.key));
  if (duplicateDeliverable) {
    throw new TemplateProblem(
      `The deliverable ${duplicateDeliverable} is defined twice`,
    );
  }
  if (deliverables.filter((d) => d.primary).length > 1) {
    throw new TemplateProblem('At most one deliverable is the primary one');
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
    title,
    ...textsOf({
      description,
      expectedOutcome,
      requirements,
      constraints,
      deliverables,
    }),
  ]
    .flatMap(placeholdersIn)
    .filter((name) => !declared.has(name));
  if (undeclared.length > 0) {
    throw new TemplateProblem(
      `Placeholders without an input: ${[...new Set(undeclared)].join(', ')}`,
    );
  }

  return {
    title,
    description,
    instructions: description,
    requirements,
    expectedOutcome,
    constraints,
    deliverables,
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

/** A task's brief from a template, its inputs filled in. */
export type RenderedTemplate = Pick<
  ApiTypes.CreateTaskRequest,
  | 'title'
  | 'description'
  | 'requirements'
  | 'expectedOutcome'
  | 'constraints'
  | 'deliverables'
>;

/**
 * The title and the text fields (description, expected outcome, the
 * descriptions of requirements, constraints and deliverables) with the
 * inputs filled in. Every required input needs a value, and only declared
 * inputs are accepted; an optional input left out becomes empty text.
 */
export function render(
  template: EffectiveTemplate,
  values: Record<string, string>,
): RenderedTemplate {
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
  const items = (list: ApiTypes.TaskItem[]) =>
    list.map((item) => ({ ...item, description: fill(item.description) }));
  return {
    title,
    description: fill(template.description),
    requirements: items(template.requirements),
    ...(template.expectedOutcome
      ? { expectedOutcome: fill(template.expectedOutcome) }
      : {}),
    constraints: items(template.constraints),
    deliverables: template.deliverables.map((deliverable) => ({
      ...deliverable,
      description: fill(deliverable.description),
    })),
  };
}

/** `second` after `first`, as paragraphs; whichever is given alone. */
function appended(
  first: string | undefined,
  second: string | undefined,
): string | undefined {
  return first && second ? `${first}\n\n${second}` : (second ?? first);
}

/** The text fields placeholders may be in. */
function textsOf(brief: {
  description: string;
  expectedOutcome: string | null;
  requirements: ApiTypes.TaskItem[];
  constraints: ApiTypes.TaskItem[];
  deliverables: ApiTypes.TaskDeliverable[];
}): string[] {
  return [
    brief.description,
    brief.expectedOutcome ?? '',
    ...brief.requirements.map((item) => item.description),
    ...brief.constraints.map((item) => item.description),
    ...brief.deliverables.map((item) => item.description),
  ];
}

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function firstDuplicate(values: string[]): string | undefined {
  return values.find((value, i) => values.indexOf(value) !== i);
}
