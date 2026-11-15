import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { DomainError } from '../error/domain-error.js';
import { InvalidCursorError } from '../pagination/cursor.js';
import {
  PROBLEM_CONTENT_TYPE,
  ProblemCode,
  problemTitle,
  problemType,
  type Problem,
  type ProblemFieldError,
} from './problem.js';
import { ValidationProblemException } from './validation-problem.exception.js';

interface Classified {
  status: number;
  code: string;
  detail: string;
  errors?: ProblemFieldError[];
}

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: ProblemCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ProblemCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ProblemCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ProblemCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ProblemCode.CONFLICT,
  [HttpStatus.PRECONDITION_FAILED]: ProblemCode.VERSION_MISMATCH,
  [HttpStatus.TOO_MANY_REQUESTS]: ProblemCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ProblemCode.UNAVAILABLE,
};

const INTERNAL_DETAIL = 'An unexpected error occurred.';

/**
 * Turns every error into problem details (RFC 9457, docs/api.md), so no
 * service formats errors itself:
 *
 * - `DomainError` → 409 with its code
 * - `ValidationProblemException` → 400 `VALIDATION_FAILED` with `errors`
 * - `InvalidCursorError` → 400 `INVALID_CURSOR`
 * - Nest `HttpException`s → their status, with the code for that status
 * - anything else → 500 `INTERNAL`, logged, with no internals in the response
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { status, code, detail, errors } = this.classify(exception);
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const problem: Problem = {
      type: problemType(code),
      title: problemTitle(code),
      status,
      detail,
      instance: (request.originalUrl ?? request.url).split('?')[0],
      code,
      traceId: traceIdOf(request),
      errors: errors ?? [],
    };

    response.status(status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }

  private classify(exception: unknown): Classified {
    if (exception instanceof DomainError) {
      return {
        status: HttpStatus.CONFLICT,
        code: exception.code,
        detail: exception.message,
      };
    }
    if (exception instanceof InvalidCursorError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ProblemCode.INVALID_CURSOR,
        detail: exception.message,
      };
    }
    if (exception instanceof ValidationProblemException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ProblemCode.VALIDATION_FAILED,
        detail: exception.message,
        errors: exception.errors,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: codeForStatus(status),
        detail: status >= 500 ? INTERNAL_DETAIL : messageOf(exception),
      };
    }
    // Errors from Express middleware (e.g. a malformed JSON body) carry a
    // client error status and are safe to show.
    const clientError = asExposedClientError(exception);
    if (clientError) {
      return {
        status: clientError.status,
        code: codeForStatus(clientError.status),
        detail: clientError.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ProblemCode.INTERNAL,
      detail: INTERNAL_DETAIL,
    };
  }
}

function codeForStatus(status: number): string {
  const known = CODE_BY_STATUS[status];
  if (known) {
    return known;
  }
  if (status >= 500) {
    return ProblemCode.INTERNAL;
  }
  // Other client errors (405, 413, 415, …) use the status name.
  return (HttpStatus[status] as string | undefined) ?? 'BAD_REQUEST';
}

function messageOf(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.join('; ');
  }
  return typeof message === 'string' ? message : exception.message;
}

function asExposedClientError(
  exception: unknown,
): { status: number; message: string } | null {
  if (!(exception instanceof Error)) {
    return null;
  }
  const { status, expose } = exception as Error & {
    status?: unknown;
    expose?: unknown;
  };
  if (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    expose === true
  ) {
    return { status, message: exception.message };
  }
  return null;
}

const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/;

/**
 * The request's trace ID, from the W3C `traceparent` header. Once services
 * run OpenTelemetry, the instrumentation sets that context on every request.
 */
function traceIdOf(request: Request): string | null {
  const header = request.headers?.traceparent;
  const value = Array.isArray(header) ? header[0] : header;
  const traceId = value ? TRACEPARENT.exec(value.trim())?.[1] : undefined;

  return traceId && !/^0+$/.test(traceId) ? traceId : null;
}
