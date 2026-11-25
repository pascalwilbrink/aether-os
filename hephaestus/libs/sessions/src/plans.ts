import type { ApiTypes } from '@hephaestus/core';

/**
 * A council's plans (../../../../docs/councils.md, Planning and
 * delegation): what makes a proposal valid, the order its entries become
 * tasks in (each with the entries it waits for, its milestone's included),
 * a reviewer's changed assignments, and what the facilitator is told.
 * Pure, so it can be tested.
 */

export type PlanMilestone = ApiTypes.CouncilPlanMilestone;
export type PlanEntry = ApiTypes.CouncilPlanEntry;
export type PlanStatus = ApiTypes.CouncilPlan['status'];

export const PLAN_LIMITS = { entries: 20, milestones: 10 };

export interface PlanContent {
  title: string;
  summary: string;
  milestones: PlanMilestone[];
  entries: PlanEntry[];
  outcomeEntryKey: string;
}

/** A plan the facilitator proposed in a run, before it's kept. */
export interface ProposedPlan {
  id: string;
  number: number;
  content: PlanContent;
  proposedAt: Date;
}

/** What `propose_plan` takes. */
export interface PlanProposal {
  title: string;
  summary: string;
  milestones?: PlanMilestone[];
  entries: PlanEntry[];
  outcomeEntryKey?: string;
}

/** A plan as the facilitator sees it on later turns. */
export interface PlanForFacilitator {
  number: number;
  title: string;
  status: PlanStatus;
  comment: string | null;
  /** An approved plan's tasks: entry key → status. */
  tasks: { entryKey: string; title: string; status: string }[];
  /** Its plan task's status, once approved with delegation. */
  taskStatus: string | null;
}

/** The plan to keep, or every reason it can't be. */
export function checkedPlan(
  proposal: PlanProposal,
  memberIds: readonly string[],
): { plan: PlanContent } | { problems: string[] } {
  const problems: string[] = [];
  const milestones = proposal.milestones ?? [];
  const entries = proposal.entries;
  if (entries.length === 0) {
    problems.push('A plan needs at least one entry.');
  }
  if (entries.length > PLAN_LIMITS.entries) {
    problems.push(`A plan has at most ${PLAN_LIMITS.entries} entries.`);
  }
  if (milestones.length > PLAN_LIMITS.milestones) {
    problems.push(`A plan has at most ${PLAN_LIMITS.milestones} milestones.`);
  }
  const entryKeys = entries.map((entry) => entry.key);
  const milestoneKeys = milestones.map((milestone) => milestone.key);
  for (const key of duplicates(entryKeys)) {
    problems.push(`Two entries have the key "${key}".`);
  }
  for (const key of duplicates(milestoneKeys)) {
    problems.push(`Two milestones have the key "${key}".`);
  }
  for (const entry of entries) {
    if (!memberIds.includes(entry.agentId)) {
      problems.push(
        `Entry "${entry.key}" is assigned to ${entry.agentId}, who isn't a member of this council.`,
      );
    }
    for (const dependency of entry.dependsOn ?? []) {
      if (!entryKeys.includes(dependency)) {
        problems.push(
          `Entry "${entry.key}" depends on "${dependency}", which isn't an entry of the plan.`,
        );
      }
    }
    if (entry.milestoneKey && !milestoneKeys.includes(entry.milestoneKey)) {
      problems.push(
        `Entry "${entry.key}" is in milestone "${entry.milestoneKey}", which isn't one of the plan's.`,
      );
    }
  }
  for (const milestone of milestones) {
    for (const dependency of milestone.dependsOn ?? []) {
      if (!milestoneKeys.includes(dependency)) {
        problems.push(
          `Milestone "${milestone.key}" depends on "${dependency}", which isn't one of the plan's.`,
        );
      }
    }
  }
  const outcomeEntryKey = proposal.outcomeEntryKey ?? entries.at(-1)?.key ?? '';
  if (entries.length > 0 && !entryKeys.includes(outcomeEntryKey)) {
    problems.push(
      `The outcome entry "${outcomeEntryKey}" isn't an entry of the plan.`,
    );
  }
  const plan: PlanContent = {
    title: proposal.title,
    summary: proposal.summary,
    milestones,
    entries,
    outcomeEntryKey,
  };
  if (problems.length === 0 && creationOrder(plan) === null) {
    problems.push(
      'The plan has a cycle: entries (or their milestones) depend on each other in a loop.',
    );
  }
  return problems.length > 0 ? { problems } : { plan };
}

/**
 * The entries in the order their tasks are made, each with every entry it
 * waits for: its own `dependsOn`, and all the entries of the milestones its
 * milestone depends on. Null when they wait on each other in a loop.
 */
export function creationOrder(
  plan: PlanContent,
): { entry: PlanEntry; dependsOn: string[] }[] | null {
  const milestoneDeps = new Map(
    plan.milestones.map((milestone) => [
      milestone.key,
      milestone.dependsOn ?? [],
    ]),
  );
  // Every milestone a milestone waits for, directly or not.
  const upstream = (key: string, seen = new Set<string>()): Set<string> => {
    for (const dependency of milestoneDeps.get(key) ?? []) {
      if (!seen.has(dependency)) {
        seen.add(dependency);
        upstream(dependency, seen);
      }
    }
    return seen;
  };
  const waitsFor = new Map(
    plan.entries.map((entry) => {
      const fromMilestones = entry.milestoneKey
        ? [...upstream(entry.milestoneKey)].flatMap((milestone) =>
            plan.entries
              .filter((other) => other.milestoneKey === milestone)
              .map((other) => other.key),
          )
        : [];
      return [
        entry.key,
        [...new Set([...(entry.dependsOn ?? []), ...fromMilestones])],
      ];
    }),
  );
  const ordered: { entry: PlanEntry; dependsOn: string[] }[] = [];
  const placed = new Set<string>();
  while (ordered.length < plan.entries.length) {
    const ready = plan.entries.find(
      (entry) =>
        !placed.has(entry.key) &&
        (waitsFor.get(entry.key) ?? []).every((key) => placed.has(key)),
    );
    if (!ready) {
      return null;
    }
    placed.add(ready.key);
    ordered.push({ entry: ready, dependsOn: waitsFor.get(ready.key) ?? [] });
  }
  return ordered;
}

/** The plan with a reviewer's assignments, or what's wrong with them. */
export function withAssignments(
  plan: PlanContent,
  assignments: readonly { entryKey: string; agentId: string }[],
  memberIds: readonly string[],
): { plan: PlanContent; changed: Set<string> } | { problem: string } {
  const changed = new Set<string>();
  for (const assignment of assignments) {
    if (!plan.entries.some((entry) => entry.key === assignment.entryKey)) {
      return {
        problem: `"${assignment.entryKey}" isn't an entry of the plan.`,
      };
    }
    if (!memberIds.includes(assignment.agentId)) {
      return {
        problem: `${assignment.agentId} isn't a member of this council.`,
      };
    }
  }
  const entries = plan.entries.map((entry) => {
    const assignment = assignments.find(
      (candidate) => candidate.entryKey === entry.key,
    );
    if (!assignment || assignment.agentId === entry.agentId) {
      return entry;
    }
    changed.add(entry.key);
    return { ...entry, agentId: assignment.agentId };
  });
  return { plan: { ...plan, entries }, changed };
}

/** What the facilitator's instructions say about planning and the session's plans. */
export function plansSection(
  plans: readonly PlanForFacilitator[],
  delegation: boolean,
): string {
  return [
    '### Plans',
    '',
    `When the person wants work done, draft a plan with the members (a round helps) and propose it with propose_plan: entries are tasks, each assigned to the member best placed to do it (say why), with what it depends on, grouped in milestones when that helps. The person reviews it: approves it${delegation ? ', which makes the tasks,' : ''} asks for changes, or rejects it.`,
    ...plans.map((plan) => {
      const head = `- Plan ${plan.number}, "${plan.title}": ${plan.status.replace('_', ' ')}`;
      const comment = plan.comment
        ? ` (the person said: "${plan.comment}")`
        : '';
      const tasks =
        plan.tasks.length > 0
          ? `; its tasks: ${plan.tasks.map((task) => `${task.entryKey} ${task.status}`).join(', ')}${plan.taskStatus ? ` (the plan task: ${plan.taskStatus})` : ''}`
          : '';
      return `${head}${comment}${tasks}.`;
    }),
    ...(plans.some((plan) => plan.status === 'changes_requested')
      ? [
          'For a plan sent back, propose a revised plan that answers the comment.',
        ]
      : []),
    ...(plans.some((plan) => plan.taskStatus === 'failed')
      ? [
          'For a plan whose task failed, say what failed and propose a revised plan for what is left.',
        ]
      : []),
  ].join('\n');
}

function duplicates(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
}
