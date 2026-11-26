import { describe, expect, it } from 'vitest';

import {
  requestContextFor,
  TASK_KEY,
  WORK_CONTEXT_KEY,
  withWorkContext,
} from './work-context.js';

const workContext = {
  workItemId: '0193a1b2-0000-7000-8000-000000000001',
  organizationId: '0193a1b2-0000-7000-8000-000000000002',
  agentId: '0193a1b2-0000-7000-8000-000000000003',
  departmentId: '0193a1b2-0000-7000-8000-000000000004',
  teamId: null,
};

describe('withWorkContext', () => {
  it('leaves a task without work as it is', () => {
    expect(withWorkContext('# Task', null)).toBe('# Task');
  });

  it('names the work item and its owners, leaving out what is unset', () => {
    const prompt = withWorkContext('# Task', workContext);
    expect(prompt).toContain('## The work');
    expect(prompt).toContain(`Work item: ${workContext.workItemId}`);
    expect(prompt).toContain(`Department: ${workContext.departmentId}`);
    expect(prompt).not.toContain('Team:');
  });
});

describe('requestContextFor', () => {
  const task = {
    id: '0193a1b2-0000-7000-8000-000000000010',
    organizationId: workContext.organizationId,
    projectId: '0193a1b2-0000-7000-8000-000000000011',
    agentId: workContext.agentId,
  };

  it("gives the tools the task's IDs and its work context", () => {
    const context = requestContextFor({ ...task, workContext });
    expect(context.get(TASK_KEY)).toEqual({
      taskId: task.id,
      organizationId: task.organizationId,
      projectId: task.projectId,
      agentId: task.agentId,
    });
    expect(context.get(WORK_CONTEXT_KEY)).toEqual(workContext);
  });

  it('has no work context for other tasks', () => {
    const context = requestContextFor({ ...task, workContext: null });
    expect(context.get(WORK_CONTEXT_KEY)).toBeUndefined();
  });
});
