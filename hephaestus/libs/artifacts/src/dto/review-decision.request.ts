import { createZodDto, zReviewDecisionRequest } from '@hephaestus/core';

export class ReviewDecisionRequest extends createZodDto(
  zReviewDecisionRequest,
) {}
