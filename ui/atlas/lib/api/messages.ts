import "server-only";

import { ApiError } from "./http";

/** Messages for Polis's problem codes (`contracts/polis.openapi.yaml`). */
export const POLIS_MESSAGES: Record<string, string> = {
  DEPARTMENT_SLUG_TAKEN: "Another department has that slug.",
  DEPARTMENT_ARCHIVED: "That department is archived.",
  DEPARTMENT_HAS_PROJECTS:
    "The department still has active projects: move or archive them first.",
  TEAM_SLUG_TAKEN: "Another team has that slug.",
  TEAM_ARCHIVED: "That team is archived.",
  TEAM_MEMBER_EXISTS: "They're in the team already.",
  PERSON_EMAIL_TAKEN: "Another person has that email address.",
  ORGANIZATION_SUSPENDED: "The organization is suspended.",
  LAST_OWNER:
    "The organization needs an owner: make someone else an owner first.",
  MEMBERSHIP_EXISTS: "They're a member already.",
  PROJECT_MEMBERSHIP_EXISTS: "They have a role in the project already.",
  PROJECT_MEMBER_NOT_IN_ORGANIZATION:
    "Only the organization's members get a role in its projects.",
  PROJECT_ROLE_EXCEEDS_CAP:
    "Their organization role doesn't allow that much in a project.",
  PROJECT_ARCHIVED: "The project is archived.",
};

/**
 * A message for people from an API error: Polis's code, then common
 * statuses. Anything that isn't an API error (a redirect) is thrown on.
 */
export function messageOf(error: unknown): string {
  if (!(error instanceof ApiError)) {
    throw error;
  }
  if (error.code && POLIS_MESSAGES[error.code]) {
    return POLIS_MESSAGES[error.code];
  }
  if (error.status === 403) {
    return "You aren't allowed to do that.";
  }
  if (error.status === 404) {
    return "That doesn't exist (any more).";
  }
  if (error.status === 400) {
    return "Some fields aren't valid. Check them and try again.";
  }
  return error.message;
}
