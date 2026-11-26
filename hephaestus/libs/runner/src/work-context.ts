import { RequestContext } from '@mastra/core/request-context';

import type { TaskResponse } from '@hephaestus/tasks';

type WorkContext = NonNullable<TaskResponse['workContext']>;

/** The key under which the agent's tools find the task's work context. */
export const WORK_CONTEXT_KEY = 'aether.workContext';
/** The key under which they find the task itself (its IDs). */
export const TASK_KEY = 'aether.task';

/**
 * With an Ergon work item: which work the task is for, so the agent knows
 * whom it's working for and can refer to it (`../ergon/CLAUDE.md`).
 */
export function withWorkContext(
  prompt: string,
  workContext: WorkContext | null | undefined,
): string {
  if (!workContext) {
    return prompt;
  }
  const lines = [
    `- Work item: ${workContext.workItemId} (Ergon)`,
    `- Organization: ${workContext.organizationId}`,
    `- Assigned agent: ${workContext.agentId} (you)`,
    ...(workContext.departmentId
      ? [`- Department: ${workContext.departmentId}`]
      : []),
    ...(workContext.teamId ? [`- Team: ${workContext.teamId}`] : []),
  ];
  return [
    prompt,
    '',
    '## The work',
    '',
    "This task is your part of a work item you're responsible for:",
    ...lines,
  ].join('\n');
}

/**
 * Mastra's request context for the run: the task's IDs, and its work
 * context when it has one, for tools that act on the work.
 */
export function requestContextFor(
  task: Pick<
    TaskResponse,
    'id' | 'organizationId' | 'projectId' | 'agentId' | 'workContext'
  >,
): RequestContext {
  const context = new RequestContext();
  context.set(TASK_KEY, {
    taskId: task.id,
    organizationId: task.organizationId,
    projectId: task.projectId,
    agentId: task.agentId,
  });
  if (task.workContext) {
    context.set(WORK_CONTEXT_KEY, {
      ...task.workContext,
      departmentId: task.workContext.departmentId ?? null,
      teamId: task.workContext.teamId ?? null,
    });
  }
  return context;
}
