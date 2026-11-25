import { v7 as uuidv7 } from 'uuid';

/**
 * A council session's deliberation rounds (../../../../docs/councils.md,
 * Deliberation rounds), as a run sees and changes them: what the facilitator
 * may start and conclude within the council's settings, and who takes part.
 * Pure, so it can be tested; the run keeps what changed (`changed`).
 */

export interface DiscussionSettings {
  /** The council's `allowDiscussion`. */
  allowed: boolean;
  maxRounds: number;
  /** Later participants see earlier answers in the round. */
  allowAgentResponses: boolean;
  /** A round can't end, or a next one start, without the facilitator's conclusion. */
  requireConclusion: boolean;
}

export interface Round {
  id: string;
  number: number;
  question: string;
  /** Agent IDs, in the order they answer. */
  participants: string[];
  status: 'open' | 'concluded';
  conclusion: string | null;
  openedAt: Date;
  concludedAt: Date | null;
}

/** A member, as rounds need them. */
export interface RoundMember {
  agentId: string;
  name: string;
  participation: 'required' | 'conditional' | 'optional';
}

export type Refusal = { refused: string };

export class Deliberation {
  private readonly rounds: Round[];
  private readonly touched = new Set<string>();

  constructor(
    readonly settings: DiscussionSettings,
    rounds: readonly Round[],
  ) {
    this.rounds = rounds.map((round) => ({ ...round }));
  }

  /** The round under way, if any. */
  get open(): Round | null {
    return this.rounds.find((round) => round.status === 'open') ?? null;
  }

  /** The session's round with this number, if any. */
  byNumber(number: number): Round | null {
    return this.rounds.find((round) => round.number === number) ?? null;
  }

  get count(): number {
    return this.rounds.length;
  }

  /** Rounds still allowed. */
  get left(): number {
    return Math.max(0, this.settings.maxRounds - this.rounds.length);
  }

  /**
   * Who answers a round, in order: the required members first (always),
   * then those asked for, as the facilitator listed them. Anyone named who
   * isn't a member is refused.
   */
  participantsFor(
    requested: readonly string[],
    members: readonly RoundMember[],
  ): RoundMember[] | Refusal {
    const unknown = requested.filter(
      (agentId) => !members.some((member) => member.agentId === agentId),
    );
    if (unknown.length > 0) {
      return {
        refused: `Not members of this council: ${unknown.join(', ')}.`,
      };
    }
    const required = members.filter(
      (member) => member.participation === 'required',
    );
    const asked = requested
      .map(
        (agentId) =>
          members.find((member) => member.agentId === agentId) as RoundMember,
      )
      .filter((member) => member.participation !== 'required');
    const participants = [...required, ...asked].filter(
      (member, index, all) =>
        all.findIndex((other) => other.agentId === member.agentId) === index,
    );
    if (participants.length === 0) {
      return {
        refused:
          'A round needs participants: name the members who should answer.',
      };
    }
    return participants;
  }

  /**
   * Opens round `count + 1`, or says why not. Without a required
   * conclusion, a round still open is closed (without one) first.
   */
  start(
    question: string,
    participants: readonly RoundMember[],
    now: Date,
  ): Round | Refusal {
    if (!this.settings.allowed) {
      return { refused: "This council doesn't hold deliberation rounds." };
    }
    const open = this.open;
    if (open && this.settings.requireConclusion) {
      return {
        refused: `Round ${open.number} is still open: conclude it with conclude_round first.`,
      };
    }
    if (this.left === 0) {
      return {
        refused: `This session has had its ${this.settings.maxRounds} rounds: conclude the discussion in your answer instead.`,
      };
    }
    if (open) {
      this.close(open, null, now);
    }
    const round: Round = {
      id: uuidv7(),
      number: this.rounds.length + 1,
      question,
      participants: participants.map((member) => member.agentId),
      status: 'open',
      conclusion: null,
      openedAt: now,
      concludedAt: null,
    };
    this.rounds.push(round);
    this.touched.add(round.id);
    return round;
  }

  /** Concludes the open round with the facilitator's conclusion, or says why not. */
  conclude(conclusion: string, now: Date): Round | Refusal {
    const open = this.open;
    if (!open) {
      return { refused: 'No round is open: start one with start_round.' };
    }
    this.close(open, conclusion, now);
    return open;
  }

  /** The rounds this run opened or concluded, to keep. */
  changed(): Round[] {
    return this.rounds.filter((round) => this.touched.has(round.id));
  }

  /** What the facilitator's instructions say about rounds now. */
  describe(): string {
    if (!this.settings.allowed) {
      return '';
    }
    const open = this.open;
    return [
      '### Deliberation rounds',
      '',
      `When a question needs the council's views, hold a round: start_round(question, participants) puts it to the required members and the ones you name; they answer in turn (${this.settings.allowAgentResponses ? 'each sees the earlier answers and can respond to them' : 'independently, without seeing each other'}), and their answers come back to you. Then conclude_round(conclusion): what was agreed, where they disagree, and what's still open.`,
      `At most ${this.settings.maxRounds} rounds in this session; ${this.left} left.${this.settings.requireConclusion ? ' A round must be concluded before the next one, and before you answer the person.' : ''}`,
      ...(open
        ? [
            `Round ${open.number} is open ("${open.question}"): conclude it before anything else.`,
          ]
        : []),
    ].join('\n');
  }

  private close(round: Round, conclusion: string | null, now: Date): void {
    round.status = 'concluded';
    round.conclusion = conclusion;
    round.concludedAt = now;
    this.touched.add(round.id);
  }
}

export const isRefusal = (value: unknown): value is Refusal =>
  typeof value === 'object' && value !== null && 'refused' in value;
