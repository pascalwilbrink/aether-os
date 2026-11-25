import {
  createZodDto,
  zApproveCouncilPlanRequest,
  zRejectCouncilPlanRequest,
  zRequestCouncilPlanChangesRequest,
} from '@hephaestus/core';

export class ApproveCouncilPlanRequest extends createZodDto(
  zApproveCouncilPlanRequest,
) {}

export class RejectCouncilPlanRequest extends createZodDto(
  zRejectCouncilPlanRequest,
) {}

export class RequestCouncilPlanChangesRequest extends createZodDto(
  zRequestCouncilPlanChangesRequest,
) {}
