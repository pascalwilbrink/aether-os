import { executionAttributes, recordedTraceId } from './execution-tracing.js';

describe('execution tracing', () => {
  it('labels the span with the tenant, task and agent version, never the task text', () => {
    const attributes = executionAttributes(
      {
        id: 't1',
        organizationId: 'o1',
        projectId: 'p1',
        topLevelTaskId: 't0',
        agentId: 'a1',
        agentVersionId: 'v1',
        attempt: 2,
      },
      'e1',
    );
    expect(attributes).toMatchObject({
      'aether.organization.id': 'o1',
      'aether.project.id': 'p1',
      'aether.task.id': 't1',
      'aether.task.top_level_id': 't0',
      'aether.task.attempt': 2,
      'aether.agent.version.id': 'v1',
      'aether.execution.id': 'e1',
      'langfuse.session.id': 't0',
    });
  });

  it('records only real trace IDs', () => {
    expect(
      recordedTraceId({ traceId: '4bf92f3577b34da6a3ce929d0e0e4736' }),
    ).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    // A span without an SDK has the invalid, all-zero trace ID.
    expect(recordedTraceId({ traceId: '0'.repeat(32) })).toBeNull();
  });
});
