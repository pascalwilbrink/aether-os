/**
 * A council's decisions and syntheses (../../../../docs/councils.md,
 * Decisions, Synthesis): what the facilitator is told about recording them,
 * and a synthesis as a run writes it. Pure, so it can be tested.
 */

/** A synthesis the facilitator wrote in a run, kept when the run ends. */
export interface WrittenSynthesis {
  id: string;
  number: number;
  content: string;
  roundIds: string[];
  writtenAt: Date;
}

/** What the facilitator's instructions say about decisions and syntheses. */
export function decisionsSection(options: {
  /** Whether it can record decisions (Seshat is there). */
  decisions: boolean;
  /** The council's `requireSynthesis`. */
  requireSynthesis: boolean;
  /** Syntheses written in the session so far. */
  syntheses: number;
}): string {
  return [
    '### Decisions and syntheses',
    '',
    ...(options.decisions
      ? [
          "When the council reaches a decision the person agrees with, record it with record_decision: what was decided and its context, the rationale, and the alternatives considered with why they weren't chosen (and the round it came from). It becomes a proposal in the project's knowledge, which a person accepts; say so.",
        ]
      : []),
    `${options.requireSynthesis ? 'This council requires a synthesis: after' : 'After'} a discussion (when its rounds are concluded), write one with write_synthesis: what was asked, what was concluded, what was decided, and what's still open.${options.syntheses > 0 ? ` The session has ${options.syntheses} so far.` : ''}`,
  ].join('\n');
}
