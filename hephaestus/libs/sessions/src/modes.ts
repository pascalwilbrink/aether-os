import type { ApiTypes } from '@hephaestus/core';
import type { CouncilVersion } from '@hephaestus/councils';

/**
 * A council session's modes (../../../../docs/councils.md, Collaboration
 * modes): which its council allows, the one it starts in, and what the
 * facilitator is told in each. Pure, so it can be tested.
 */

export type SessionMode = ApiTypes.SessionMode;

export const SESSION_MODES: readonly SessionMode[] = [
  'direct',
  'facilitated',
  'discussion',
  'planning',
  'delegation',
];

/** Modes that come with plans (step 4): not offered until then. */
const NOT_YET: ReadonlySet<SessionMode> = new Set(['planning', 'delegation']);

type Settings = Pick<
  CouncilVersion['settings'],
  | 'defaultMode'
  | 'allowDirectInteraction'
  | 'allowDiscussion'
  | 'allowPlanning'
  | 'allowDelegation'
>;

/** The modes the council's settings allow, that Hephaestus can run now. */
export function allowedModes(settings: Settings): SessionMode[] {
  const allowed: Record<SessionMode, boolean> = {
    direct: settings.allowDirectInteraction,
    facilitated: true,
    discussion: settings.allowDiscussion,
    planning: settings.allowPlanning,
    delegation: settings.allowDelegation,
  };
  return SESSION_MODES.filter((mode) => allowed[mode] && !NOT_YET.has(mode));
}

/** A new session's mode: the council's default when it can run it, else `facilitated`. */
export function initialMode(settings: Settings): SessionMode {
  return allowedModes(settings).includes(settings.defaultMode)
    ? settings.defaultMode
    : 'facilitated';
}

/** Why a mode can't be chosen, or null. */
export function modeProblem(
  mode: SessionMode,
  settings: Settings,
): string | null {
  if (allowedModes(settings).includes(mode)) {
    return null;
  }
  if (NOT_YET.has(mode)) {
    return `The ${mode} mode comes with plans, which aren't available yet.`;
  }
  return `This council doesn't allow the ${mode} mode.`;
}

const GUIDANCE: Record<SessionMode, string> = {
  direct:
    "The person is talking to members directly (they choose whom to address). Stay out of it: answer only what's asked of you, briefly, or point them to the member who knows.",
  facilitated:
    "Answer the person yourself, ask members (ask_member) when they know more, and hold a round (start_round) when a question needs the council's views.",
  discussion:
    "Put the person's questions to the council as deliberation rounds (start_round), conclude each one, and answer the person with the conclusion. Answer yourself only for small clarifications.",
  planning: '',
  delegation: '',
};

/** What the facilitator's instructions say about the session's mode. */
export function modeSection(
  mode: SessionMode,
  allowed: readonly SessionMode[],
): string {
  const others = allowed.filter((candidate) => candidate !== mode);
  return [
    '### How the council is working now',
    '',
    `Mode: ${mode}. ${GUIDANCE[mode]}`,
    ...(others.length > 0
      ? [
          `When the conversation calls for another way of working (${others.join(', ')}), switch with set_mode and say why.`,
        ]
      : []),
  ].join('\n');
}
