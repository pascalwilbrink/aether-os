import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import { DomainError } from '../error/domain-error.js';

/**
 * Domain errors are business-rule violations (e.g. modifying an archived
 * agent), so they map to 409 Conflict with the error code in the body.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    response.status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      error: error.code,
      message: error.message,
    });
  }
}
