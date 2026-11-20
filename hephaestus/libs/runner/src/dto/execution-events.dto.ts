import {
  createZodDto,
  zExecutionEventPage,
  zListExecutionEventsPath,
  zListExecutionEventsQuery,
} from '@hephaestus/core';

/** `:organizationId`, `:projectId`, `:taskId` and `:executionId`. */
export class ExecutionEventsParams extends createZodDto(
  zListExecutionEventsPath,
) {}
export class ListExecutionEventsQuery extends createZodDto(
  zListExecutionEventsQuery,
) {}
export class ExecutionEventPage extends createZodDto(zExecutionEventPage) {}
