import { createZodDto, zGetTaskTreeBudgetPath } from '@hephaestus/core';

/** `:organizationId`, `:projectId` and `:taskId`. */
export class TaskBudgetParams extends createZodDto(zGetTaskTreeBudgetPath) {}
