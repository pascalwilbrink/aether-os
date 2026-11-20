import {
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';

import { FieldErrorCode, type ProblemFieldError } from './problem.js';
import { ValidationProblemException } from './validation-problem.exception.js';
import { isZodDtoClass } from './zod-dto.js';

type Location = ArgumentMetadata['type'];

/**
 * Validates parameters whose type is a Zod DTO (`createZodDto(schema)`, with
 * schemas generated from the spec) and returns the parsed value. Failures are
 * `ValidationProblemException`s, so they come out as `400 VALIDATION_FAILED`
 * problem details with one entry per issue.
 *
 * Two things the generated schemas leave to us:
 *
 * - **Unknown fields are rejected** (`UNKNOWN_FIELD`), as `additionalProperties:
 *   false` says, by comparing the input with the parsed output: Zod drops
 *   keys it doesn't know, so every dropped key was unknown.
 * - **Query and path parameters arrive as strings**, so numeric and boolean
 *   strings are converted where the schema expects a number or boolean, and
 *   a single value is wrapped where it expects an array (a repeated
 *   parameter given once).
 *
 * Parameters that aren't Zod DTOs pass through unchanged.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const { metatype } = metadata;
    if (!isZodDtoClass(metatype)) {
      return value;
    }
    const schema = metatype.schema;
    const location = metadata.type;
    const input =
      location === 'query' || location === 'param'
        ? coerceStrings(schema, value)
        : value;

    const result = schema.safeParse(input);
    if (!result.success) {
      throw new ValidationProblemException(
        result.error.issues.map((issue) =>
          issueToFieldError(issue, input, location),
        ),
      );
    }

    const unknown = unknownPaths(input, result.data);
    if (unknown.length > 0) {
      throw new ValidationProblemException(
        unknown.map((path) => ({
          ...locate(path, location),
          code: FieldErrorCode.UNKNOWN_FIELD,
          detail: `${path.at(-1)} is not a known field`,
        })),
      );
    }

    return result.data;
  }
}

function issueToFieldError(
  issue: z.core.$ZodIssue,
  input: unknown,
  location: Location,
): ProblemFieldError {
  const path = issue.path.map(String);
  // Whatever Zod calls it (invalid_type, invalid_value for an enum, …), an
  // issue on a value that isn't there means the field is required.
  const missing = valueAt(input, path) === undefined;

  return {
    ...locate(path, location),
    code: missing ? FieldErrorCode.REQUIRED : FieldErrorCode.INVALID,
    detail: missing ? 'is required' : issue.message,
  };
}

function locate(
  path: string[],
  location: Location,
): Pick<ProblemFieldError, 'pointer' | 'parameter'> {
  return location === 'body'
    ? { pointer: toPointer(path), parameter: null }
    : { pointer: null, parameter: path.join('.') };
}

/** RFC 6901: `~` → `~0`, `/` → `~1`. */
function toPointer(path: string[]): string {
  return path
    .map((segment) => '/' + segment.replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueAt(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isObject(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Paths of keys present in the input but dropped by parsing. */
function unknownPaths(
  input: unknown,
  output: unknown,
  path: string[] = [],
): string[][] {
  if (Array.isArray(input) && Array.isArray(output)) {
    return input.flatMap((item, i) =>
      unknownPaths(item, output[i], [...path, String(i)]),
    );
  }
  if (isObject(input) && isObject(output)) {
    return Object.keys(input).flatMap((key) =>
      key in output
        ? unknownPaths(input[key], output[key], [...path, key])
        : [[...path, key]],
    );
  }
  return [];
}

const WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'readonly',
  'nonoptional',
  'catch',
]);

interface Def {
  type: string;
  innerType?: z.ZodType;
  shape?: Record<string, z.ZodType>;
  left?: z.ZodType;
  right?: z.ZodType;
}

function defOf(schema: z.ZodType): Def {
  return (schema as unknown as { _zod: { def: Def } })._zod.def;
}

function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema;
  let def = defOf(current);
  while (WRAPPERS.has(def.type) && def.innerType) {
    current = def.innerType;
    def = defOf(current);
  }
  return current;
}

function shapeOf(schema: z.ZodType): Record<string, z.ZodType> | null {
  const def = defOf(unwrap(schema));
  if (def.type === 'object' && def.shape) {
    return def.shape;
  }
  if (def.type === 'intersection' && def.left && def.right) {
    return { ...shapeOf(def.left), ...shapeOf(def.right) };
  }
  return null;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Converts query/path strings to numbers or booleans where the schema wants one. */
function coerceStrings(schema: z.ZodType, value: unknown): unknown {
  const shape = shapeOf(schema);
  if (!shape || !isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => {
      const field = shape[key];
      if (!field || typeof raw !== 'string') {
        return [key, raw];
      }
      const type = defOf(unwrap(field)).type;
      if (type === 'number' && NUMERIC.test(raw)) {
        return [key, Number(raw)];
      }
      if (type === 'boolean' && (raw === 'true' || raw === 'false')) {
        return [key, raw === 'true'];
      }
      // A repeated parameter (`?id=a&id=b`) given once arrives as a string.
      if (type === 'array') {
        return [key, [raw]];
      }
      return [key, raw];
    }),
  );
}
