import { createZodDto, zBudgetResponse } from '@hephaestus/core';

/** A task tree's budget, as Pylon has it. */
export class BudgetResponse extends createZodDto(zBudgetResponse) {}
