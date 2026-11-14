import { QueryFailedError } from 'typeorm';

/**
 * True when a query failed on a unique constraint.
 * SQLite reports SQLITE_CONSTRAINT_UNIQUE; Postgres uses SQLSTATE 23505.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const code = (error.driverError as { code?: string } | undefined)?.code;

  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === '23505';
}
