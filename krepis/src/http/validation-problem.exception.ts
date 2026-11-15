import { BadRequestException } from '@nestjs/common';

import type { ProblemFieldError } from './problem.js';

/**
 * A request that failed validation: becomes `400 VALIDATION_FAILED` with one
 * `errors` entry per invalid input. Validation pipes throw it, whichever
 * library they validate with.
 */
export class ValidationProblemException extends BadRequestException {
  constructor(readonly errors: ProblemFieldError[]) {
    super('The request is invalid.');
  }
}
