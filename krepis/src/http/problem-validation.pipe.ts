import {
  type ArgumentMetadata,
  Injectable,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

import { FieldErrorCode, type ProblemFieldError } from './problem.js';
import { ValidationProblemException } from './validation-problem.exception.js';
import { isZodDtoClass } from './zod-dto.js';

/** Carries class-validator's errors from the exception factory to `transform`. */
class ClassValidatorErrors extends Error {
  constructor(readonly errors: ValidationError[]) {
    super('Validation failed');
  }
}

/**
 * The platform's class-validator pipe: strict (unknown fields rejected),
 * transforming, and failing with `ValidationProblemException`, so errors come
 * out as problem details with a JSON Pointer per body field or the name of the
 * query or path parameter.
 *
 * Zod DTOs are left to `ZodValidationPipe`, so a service can move one DTO at
 * a time; the target (docs/engineering.md) is Zod everywhere.
 */
@Injectable()
export class ProblemValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => new ClassValidatorErrors(errors),
    });
  }

  override async transform(value: unknown, metadata: ArgumentMetadata) {
    if (isZodDtoClass(metadata.metatype)) {
      return value;
    }
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (error instanceof ClassValidatorErrors) {
        throw new ValidationProblemException(
          toFieldErrors(error.errors, metadata.type === 'body'),
        );
      }
      throw error;
    }
  }
}

export function toFieldErrors(
  errors: ValidationError[],
  inBody: boolean,
  path: string[] = [],
): ProblemFieldError[] {
  return errors.flatMap((error) => {
    const at = [...path, error.property];
    const own: ProblemFieldError[] = error.constraints
      ? [
          {
            pointer: inBody ? toPointer(at) : null,
            parameter: inBody ? null : at.join('.'),
            code: fieldErrorCode(error),
            detail: Object.values(error.constraints).join('; '),
          },
        ]
      : [];

    return [...own, ...toFieldErrors(error.children ?? [], inBody, at)];
  });
}

function fieldErrorCode(error: ValidationError): string {
  const constraints = Object.keys(error.constraints ?? {});
  if (constraints.includes('whitelistValidation')) {
    return FieldErrorCode.UNKNOWN_FIELD;
  }
  if (error.value === undefined || constraints.includes('isDefined')) {
    return FieldErrorCode.REQUIRED;
  }
  return FieldErrorCode.INVALID;
}

/** RFC 6901: `~` → `~0`, `/` → `~1`. */
function toPointer(path: string[]): string {
  return path
    .map((segment) => '/' + segment.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('');
}
