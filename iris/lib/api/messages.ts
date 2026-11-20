import "server-only";

import { ApiError } from "./http";

/**
 * A message for people from an API error: `byCode` for a problem's `code`,
 * then common statuses. Anything that isn't an API error is thrown on.
 */
export function messageOf(
  error: unknown,
  byCode: Record<string, string> = {},
): string {
  if (!(error instanceof ApiError)) {
    throw error;
  }
  if (error.code && byCode[error.code]) {
    return byCode[error.code];
  }
  if (error.status === 403) {
    return "You aren't allowed to do that.";
  }
  if (error.status === 400) {
    return "Some fields aren't valid. Check them and try again.";
  }
  return error.message;
}
