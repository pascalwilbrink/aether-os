import { createZodDto, zCouncilPlan, zCouncilPlanPage } from '@hephaestus/core';

export class CouncilPlan extends createZodDto(zCouncilPlan) {}

export class CouncilPlanPage extends createZodDto(zCouncilPlanPage) {}
