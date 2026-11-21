import { createHash } from 'node:crypto';

import type { ApiTypes, ProxenosEvents } from '@kairos/core';

import type { StoredAction, StoredTrigger } from './automation.entity.js';

type IssueEvent = ProxenosEvents.GithubIssueOpened;
type Permission = ApiTypes.RepositoryPermission;
type EventType = ApiTypes.GitHubIssueEventType;

/** Roles on a repository, weakest first (GitHub's). */
const ROLES: string[] = ['read', 'triage', 'write', 'maintain', 'admin'];

/** The fields `{{…}}` can name in an automation's task (docs/automations.md). */
export const FIELDS = [
  'issue.number',
  'issue.title',
  'issue.url',
  'repository',
  'author',
  'label',
] as const;

const PLACEHOLDER = /{{\s*([a-z.]+)\s*}}/g;

/** Defaults filled in, so stored triggers are explicit. */
export function storedTrigger(
  trigger: ApiTypes.AutomationTrigger,
): StoredTrigger {
  return {
    type: trigger.type,
    event: trigger.event,
    repositoryLinkId: trigger.repositoryLinkId ?? null,
    label: trigger.label ?? null,
    minimumPermission: trigger.minimumPermission ?? 'write',
    includePullRequests: trigger.includePullRequests ?? false,
    includeAetherOs: trigger.includeAetherOs ?? false,
  };
}

/** Defaults filled in, so stored actions are explicit. */
export function storedAction(action: ApiTypes.AutomationAction): StoredAction {
  return {
    ...action,
    workInRepository: action.workInRepository ?? true,
    reviewArtifactKinds: action.reviewArtifactKinds ?? [],
    concurrency: action.concurrency ?? null,
  };
}

/** Problems with an action, as JSON Pointers under `/action`. */
export function actionProblems(
  action: ApiTypes.AutomationAction,
): { pointer: string; detail: string }[] {
  const problems: { pointer: string; detail: string }[] = [];
  if (!action.task === !action.template) {
    problems.push({
      pointer: '/action',
      detail: 'Give exactly one of task and template.',
    });
  }
  const texts: [string, string][] = [
    ...(action.task
      ? ([
          ['/action/task/title', action.task.title],
          ['/action/task/instructions', action.task.instructions],
        ] as [string, string][])
      : []),
    ...Object.entries(action.template?.inputs ?? {}).map(
      ([name, value]) =>
        [`/action/template/inputs/${name}`, value] as [string, string],
    ),
    ...(action.concurrency
      ? ([['/action/concurrency/key', action.concurrency.key]] as [
          string,
          string,
        ][])
      : []),
  ];
  for (const [pointer, text] of texts) {
    const unknown = placeholdersIn(text).filter(
      (name) => !(FIELDS as readonly string[]).includes(name),
    );
    if (unknown.length > 0) {
      problems.push({
        pointer,
        detail: `Unknown fields ${unknown.map((name) => `{{${name}}}`).join(', ')}; use ${FIELDS.map((name) => `{{${name}}}`).join(', ')}.`,
      });
    }
  }
  return problems;
}

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

/**
 * Whether an event fires a trigger for a project, and with which of its
 * repository links (the task's repository); null when it doesn't fire.
 */
export function match(
  trigger: StoredTrigger,
  eventType: EventType,
  event: IssueEvent,
  projectId: string,
): { linkId: string } | null {
  if (trigger.event !== eventType) return null;
  const link = event.links.find((entry) => entry.projectId === projectId);
  if (!link) return null;
  if (trigger.repositoryLinkId && trigger.repositoryLinkId !== link.linkId) {
    return null;
  }
  if (event.isPullRequest && !trigger.includePullRequests) return null;
  // No loops: Aether-os's own bot never fires an automation unless asked.
  if (event.fromAetherOs && !trigger.includeAetherOs) return null;
  if (!trusted(event.authorPermission, trigger.minimumPermission)) {
    return null;
  }
  if (trigger.label) {
    const labelled =
      eventType === 'github.issue.labeled'
        ? event.label === trigger.label
        : event.labels.includes(trigger.label);
    if (!labelled) return null;
  }
  return { linkId: link.linkId };
}

/** The author's role meets the least one required; unknown is untrusted. */
function trusted(
  actual: IssueEvent['authorPermission'],
  required: Permission,
): boolean {
  if (required === 'any') return true;
  if (!actual || actual === 'none') return false;
  return ROLES.indexOf(actual) >= ROLES.indexOf(required);
}

/** The event's fields for `{{…}}`. */
export function fieldsOf(event: IssueEvent): Record<string, string> {
  return {
    'issue.number': String(event.number),
    'issue.title': event.title,
    'issue.url': event.url,
    repository: event.repository,
    author: event.author.login,
    label: event.label ?? '',
  };
}

/**
 * Fields written by whoever opened the issue (docs/git.md, Untrusted input):
 * never pasted into a task's text, but sent to Hephaestus as untrusted
 * inputs, which the agent sees marked as data.
 */
export const UNTRUSTED_FIELDS: ReadonlySet<string> = new Set(['issue.title']);

/**
 * A task's text from the automation's: the event's fields filled in, but
 * the untrusted ones left as `{{name}}`, which Hephaestus fills in from the
 * task's untrusted inputs (`untrustedInputsOf`).
 */
export function renderForTask(
  text: string,
  fields: Record<string, string>,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    UNTRUSTED_FIELDS.has(name)
      ? `{{${name}}}`
      : name in fields
        ? fields[name]
        : whole,
  );
}

/** The untrusted fields as Hephaestus's `untrustedInputs`, saying where they came from. */
export function untrustedInputsOf(
  fields: Record<string, string>,
): { name: string; source: string; value: string }[] {
  const source = `GitHub issue #${fields['issue.number']} in ${fields.repository}, opened by @${fields.author}`;
  return [...UNTRUSTED_FIELDS].map((name) => ({
    name,
    source,
    value: fields[name] ?? '',
  }));
}

/** Fills in `{{…}}` (unknown names were refused when the automation was saved). */
export function render(text: string, fields: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in fields ? fields[name] : whole,
  );
}

/**
 * The concurrency key sent to Hephaestus: the automation's own (two
 * automations never share one), with the event's fields filled in, at most
 * 200 characters (a long one is hashed).
 */
export function concurrencyKey(
  automationId: string,
  key: string,
  fields: Record<string, string>,
): string {
  const rendered = render(key, fields);
  return `${automationId}:${
    rendered.length <= 160
      ? rendered
      : createHash('sha256').update(rendered).digest('hex')
  }`;
}
