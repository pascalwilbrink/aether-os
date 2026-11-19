import type { Attributes } from '@opentelemetry/api';

import type { TaskResponse } from '@hephaestus/tasks';

/**
 * What an execution's span carries (../../CLAUDE.md, Observability): the
 * tenant, the task and the pinned agent version, to filter traces by, and
 * the Langfuse trace attributes (a task tree is one Langfuse session).
 * Never a task's title or instructions: those are in the agent's own spans,
 * which only go to Langfuse.
 */
export function executionAttributes(
  task: Pick<
    TaskResponse,
    | 'id'
    | 'organizationId'
    | 'projectId'
    | 'topLevelTaskId'
    | 'agentId'
    | 'agentVersionId'
    | 'attempt'
  >,
  executionId: string,
): Attributes {
  return {
    'aether.organization.id': task.organizationId,
    'aether.project.id': task.projectId,
    'aether.task.id': task.id,
    'aether.task.top_level_id': task.topLevelTaskId,
    'aether.task.attempt': task.attempt,
    'aether.agent.id': task.agentId,
    'aether.agent.version.id': task.agentVersionId,
    'aether.execution.id': executionId,
    'langfuse.trace.name': 'task.execution',
    'langfuse.session.id': task.topLevelTaskId,
    'langfuse.trace.metadata.organization_id': task.organizationId,
    'langfuse.trace.metadata.project_id': task.projectId,
    'langfuse.trace.metadata.task_id': task.id,
    'langfuse.trace.metadata.agent_version_id': task.agentVersionId,
    'langfuse.trace.metadata.execution_id': executionId,
  };
}

/** A real trace ID (an SDK is running), or null. */
export function recordedTraceId(spanContext: {
  traceId: string;
}): string | null {
  return /^(?!0+$)[0-9a-f]{32}$/.test(spanContext.traceId)
    ? spanContext.traceId
    : null;
}
