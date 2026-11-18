export interface TaskTokenRequest {
  serviceAccountId: string;
  organizationId: string;
  projectId: string;
  taskId: string;
  /** At most 3600 (Pistis's limit). */
  expiresInSeconds: number;
}

/**
 * Task tokens: the task's service account, limited to its project, with
 * Hephaestus as the actor (Pistis's token exchange, ../docs/identity.md).
 * Throws `RunnerFailure` (`access_denied`) when Pistis refuses the service
 * account, and a retryable one when Pistis can't be reached.
 */
export abstract class TaskTokens {
  abstract issue(request: TaskTokenRequest): Promise<string>;
}
