import { createZodDto, zSetBudgetRequest } from '@hephaestus/core';

/** PUT: the limit, or null for none. */
export class SetBudgetRequest extends createZodDto(zSetBudgetRequest) {}
