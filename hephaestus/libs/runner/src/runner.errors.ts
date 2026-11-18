/** Why an execution failed, as recorded on it (ExecutionFailureReason). */
export type ExecutionFailureReason =
  | 'agent_failed'
  | 'timeout'
  | 'infrastructure'
  | 'access_denied'
  | 'interrupted'
  | 'verification_failed';

/**
 * An execution failure with its reason, thrown by the ports. `infrastructure`
 * is retried unless `retryable` is false (a configuration problem retrying
 * won't fix); anything thrown that isn't a `RunnerFailure` counts as a
 * retryable infrastructure failure.
 */
export class RunnerFailure extends Error {
  constructor(
    message: string,
    readonly reason: ExecutionFailureReason,
    readonly retryable = reason === 'infrastructure',
  ) {
    super(message);
    this.name = 'RunnerFailure';
  }
}
