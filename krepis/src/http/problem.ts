/**
 * Problem details (RFC 9457), as every Aether-os API returns errors. See
 * docs/api.md. `code`, `traceId` and `errors` are our extensions; every field
 * is always present (`null` / `[]` when unset).
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string | null;
  errors: ProblemFieldError[];
}

/**
 * One invalid input. `pointer` is a JSON Pointer into the request body;
 * `parameter` names a query or path parameter. Exactly one is set.
 */
export interface ProblemFieldError {
  pointer: string | null;
  parameter: string | null;
  code: string;
  detail: string;
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** The codes Krepis itself produces; services add their DomainError codes. */
export const ProblemCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CURSOR: 'INVALID_CURSOR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

/** Codes of one invalid input, in `ProblemFieldError.code`. */
export const FieldErrorCode = {
  REQUIRED: 'REQUIRED',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  INVALID: 'INVALID',
} as const;

const TITLES: Record<string, string> = {
  VALIDATION_FAILED: 'Request validation failed',
  INVALID_CURSOR: 'Invalid cursor',
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'Permission denied',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Conflict',
  VERSION_MISMATCH: 'Version mismatch',
  RATE_LIMITED: 'Too many requests',
  INTERNAL: 'Internal error',
  UNAVAILABLE: 'Service unavailable',
};

/** `urn:aether-os:problem:<code in kebab case>`: one type per code. */
export function problemType(code: string): string {
  return `urn:aether-os:problem:${code.toLowerCase().replaceAll('_', '-')}`;
}

/**
 * The title for a code, the same for every occurrence. Codes without a fixed
 * title (domain error codes) read as a sentence: `PROJECT_ARCHIVED` →
 * "Project archived".
 */
export function problemTitle(code: string): string {
  const fixed = TITLES[code];
  if (fixed) {
    return fixed;
  }
  const words = code.toLowerCase().replaceAll('_', ' ');

  return words.charAt(0).toUpperCase() + words.slice(1);
}
