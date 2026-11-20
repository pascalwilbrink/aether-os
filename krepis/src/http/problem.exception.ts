/**
 * A problem a service states fully itself: its status, `code`, `detail`
 * (shown as is, even for a 5xx) and extension members (`../docs/api.md`),
 * e.g. Pylon's `402 BUDGET_EXHAUSTED` with the `budget` that ran out.
 * Extensions never replace the standard members.
 */
export class ProblemException extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail);
    this.name = 'ProblemException';
  }
}
