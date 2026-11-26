import {
  createZodDto,
  zCreateWorkDependencyPath,
  zDeleteWorkDependencyPath,
  zEndWorkAssignmentPath,
  zGetWorkItemPath,
  zListWorkActivityQuery,
  zListWorkAssignmentsQuery,
  zListWorkItemsPath,
  zListWorkItemsQuery,
  zWorkActivityPage,
  zWorkAssignmentEndRequest,
  zWorkAssignmentPage,
  zWorkAssignmentRequest,
  zWorkAssignmentResponse,
  zWorkDependencyList,
  zWorkDependencyRequest,
  zWorkDependencyResponse,
  zWorkItemPage,
  zWorkItemRequest,
  zWorkItemResponse,
  zWorkItemTransitionRequest,
  zWorkItemUpdate,
} from '@ergon/core';

export class WorkItemRequest extends createZodDto(zWorkItemRequest) {}
export class WorkItemUpdate extends createZodDto(zWorkItemUpdate) {}
export class WorkItemTransitionRequest extends createZodDto(
  zWorkItemTransitionRequest,
) {}
export class WorkItemResponse extends createZodDto(zWorkItemResponse) {}
export class WorkItemPage extends createZodDto(zWorkItemPage) {}
export class WorkActivityPage extends createZodDto(zWorkActivityPage) {}

export class WorkAssignmentRequest extends createZodDto(
  zWorkAssignmentRequest,
) {}
export class WorkAssignmentEndRequest extends createZodDto(
  zWorkAssignmentEndRequest,
) {}
export class WorkAssignmentResponse extends createZodDto(
  zWorkAssignmentResponse,
) {}
export class WorkAssignmentPage extends createZodDto(zWorkAssignmentPage) {}

export class WorkDependencyRequest extends createZodDto(
  zWorkDependencyRequest,
) {}
export class WorkDependencyResponse extends createZodDto(
  zWorkDependencyResponse,
) {}
export class WorkDependencyList extends createZodDto(zWorkDependencyList) {}

/** `:organizationId`. */
export class OrganizationParams extends createZodDto(zListWorkItemsPath) {}
/** `:organizationId` and `:workItemId`. */
export class WorkItemParams extends createZodDto(zGetWorkItemPath) {}
/** `:organizationId`, `:workItemId` and `:assignmentId`. */
export class AssignmentParams extends createZodDto(zEndWorkAssignmentPath) {}
/** `:organizationId` and `:dependencyId`. */
export class DependencyParams extends createZodDto(zDeleteWorkDependencyPath) {}
/** `:organizationId` (creating a dependency). */
export class DependenciesParams extends createZodDto(
  zCreateWorkDependencyPath,
) {}

export class ListWorkItemsQuery extends createZodDto(zListWorkItemsQuery) {}
export class ListWorkActivityQuery extends createZodDto(
  zListWorkActivityQuery,
) {}
export class ListWorkAssignmentsQuery extends createZodDto(
  zListWorkAssignmentsQuery,
) {}
