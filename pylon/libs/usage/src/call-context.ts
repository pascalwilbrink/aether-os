/**
 * Who a call is for (docs/pylon.md, Identity): from the caller's token, and
 * the labels it sent. Budgets use only what came from the token.
 */
export interface CallContext {
  organizationId: string;
  projectId: string;
  taskId: string | null;
  taskTreeId: string | null;
  agentId: string | null;
  agentVersionId: string | null;
  /** The session, for a session token's call (Hephaestus's sessions, docs/interaction.md). */
  sessionId: string | null;
  /** `X-Aether-Execution-Id`: a label, nothing more. */
  executionId: string | null;
  /** The token's `sub`. */
  caller: string;
  purpose: string;
}

/** The budgets a call counts against: those its context names. */
export type BudgetContext = Pick<
  CallContext,
  'organizationId' | 'projectId' | 'agentId' | 'taskTreeId'
>;
