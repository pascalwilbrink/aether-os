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
