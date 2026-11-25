import { createZodDto, zApproveCouncilPlanPath } from '@hephaestus/core';

export class PlanParams extends createZodDto(zApproveCouncilPlanPath) {}
