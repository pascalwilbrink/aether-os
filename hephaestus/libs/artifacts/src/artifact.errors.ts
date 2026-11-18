import { DomainError } from '@hephaestus/core';

/**
 * An artifact the agent tried to record that breaks a limit; the message
 * goes back to the agent (a tool error), so it can try again differently.
 */
export class ArtifactRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactRejectedError';
  }
}

/** Only drafts are reviewed. */
export class ArtifactNotDraftError extends DomainError {
  constructor(artifactId: string, status: string) {
    super(
      `Artifact ${artifactId} is ${status}, not a draft waiting for review.`,
      'ARTIFACT_NOT_DRAFT',
    );
  }
}

/** The task has used its review rounds: approve or reject instead. */
export class TaskReviewRoundsExhaustedError extends DomainError {
  constructor(taskId: string, rounds: number) {
    super(
      `Task ${taskId} has had its ${rounds} review rounds; approve or reject its drafts.`,
      'TASK_REVIEW_ROUNDS_EXHAUSTED',
    );
  }
}
