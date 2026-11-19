import {
  createZodDto,
  zAutomationPage,
  zAutomationRequest,
  zAutomationResponse,
  zAutomationRunPage,
  zGetAutomationPath,
  zListAutomationRunsQuery,
  zListAutomationsPath,
  zListAutomationsQuery,
} from '@kairos/core';

export class AutomationRequest extends createZodDto(zAutomationRequest) {}
export class AutomationResponse extends createZodDto(zAutomationResponse) {}
export class AutomationPage extends createZodDto(zAutomationPage) {}
export class AutomationRunPage extends createZodDto(zAutomationRunPage) {}

/** `:organizationId` and `:projectId`. */
export class AutomationsParams extends createZodDto(zListAutomationsPath) {}

/** `:organizationId`, `:projectId` and `:automationId`. */
export class AutomationParams extends createZodDto(zGetAutomationPath) {}

export class ListAutomationsQuery extends createZodDto(zListAutomationsQuery) {}
export class ListAutomationRunsQuery extends createZodDto(
  zListAutomationRunsQuery,
) {}
