import type { components } from "./api/generated/agora-api";

type Schemas = components["schemas"];
export type CouncilVersionRequest = Schemas["CreateCouncilVersionRequest"];
export type CouncilVersion = Schemas["CouncilVersionResponse"];
export type CouncilMode = Schemas["CouncilMode"];
export type Participation = Schemas["CouncilParticipation"];

/** The council form's fields, as text (`valuesOf`). */
export type CouncilFields = Record<string, string | undefined>;

/** A row of the members editor. */
export interface MemberRow {
  agentId: string;
  participation: Participation;
  when: string;
  role: string;
}

export const PARTICIPATION: {
  value: Participation;
  label: string;
  hint: string;
}[] = [
  { value: "required", label: "Required", hint: "always takes part" },
  {
    value: "conditional",
    label: "Conditional",
    hint: "when the facilitator judges it applies",
  },
  { value: "optional", label: "Optional", hint: "only when invited" },
];

export const MODES: { value: CouncilMode; label: string; setting?: string }[] =
  [
    { value: "facilitated", label: "Facilitated" },
    { value: "direct", label: "Direct", setting: "allowDirectInteraction" },
    { value: "discussion", label: "Discussion", setting: "allowDiscussion" },
    { value: "planning", label: "Planning", setting: "allowPlanning" },
    { value: "delegation", label: "Delegation", setting: "allowDelegation" },
  ];

/** The most members and rounds Agora accepts. */
export const COUNCIL_LIMITS = { members: 12, maxRounds: 10 };

export const KEY_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/** A key suggested from a council's name: `Software Architecture` → `software-architecture`. */
export function keyFromName(name: string): string {
  const key = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 63)
    .replace(/-+$/, "");
  return key;
}

const checked = (fields: CouncilFields, name: string) => fields[name] === "on";

/**
 * A council version's request from its form, or what's wrong: the
 * facilitator, the members (the editor's JSON rows, empty ones left out),
 * the settings (checkboxes) and the discussion limits. Agora checks the
 * agents themselves (they exist, are active and published).
 */
export function councilVersionFromForm(
  fields: CouncilFields,
): { request: CouncilVersionRequest } | { error: string } {
  const facilitator = (fields.facilitator ?? "").trim();
  if (!facilitator) return { error: "Choose the facilitator." };
  let rows: Partial<MemberRow>[];
  try {
    rows = JSON.parse(fields.members || "[]") as Partial<MemberRow>[];
    if (!Array.isArray(rows)) throw new Error();
  } catch {
    return { error: "The members couldn't be read." };
  }
  const members: CouncilVersionRequest["members"] = [];
  for (const row of rows) {
    const agentId = String(row.agentId ?? "").trim();
    if (!agentId) continue;
    if (agentId === facilitator) {
      return { error: "The facilitator can't also be a member." };
    }
    if (members.some((member) => member.agentId === agentId)) {
      return { error: "Each agent is a member once." };
    }
    const participation = PARTICIPATION.some(
      (p) => p.value === row.participation,
    )
      ? (row.participation as Participation)
      : "required";
    const when = String(row.when ?? "").trim();
    const role = String(row.role ?? "").trim();
    if (participation === "conditional" && !when) {
      return { error: "Say when each conditional member takes part." };
    }
    members.push({
      agentId,
      participation,
      ...(participation === "conditional" ? { when } : {}),
      ...(role ? { role } : {}),
    });
  }
  if (members.length === 0) return { error: "Add at least one member." };
  if (members.length > COUNCIL_LIMITS.members) {
    return { error: `At most ${COUNCIL_LIMITS.members} members.` };
  }
  const settings = {
    allowDirectInteraction: checked(fields, "allowDirectInteraction"),
    allowDiscussion: checked(fields, "allowDiscussion"),
    allowPlanning: checked(fields, "allowPlanning"),
    allowDelegation: checked(fields, "allowDelegation"),
    requireSynthesis: checked(fields, "requireSynthesis"),
  };
  const defaultMode = (fields.defaultMode || "facilitated") as CouncilMode;
  const mode = MODES.find((entry) => entry.value === defaultMode);
  if (!mode) return { error: "Choose a default mode." };
  if (mode.setting && !settings[mode.setting as keyof typeof settings]) {
    return { error: `The default mode (${mode.label}) has to be allowed.` };
  }
  const maxRounds = Number(fields.maxRounds || 3);
  if (
    !Number.isInteger(maxRounds) ||
    maxRounds < 1 ||
    maxRounds > COUNCIL_LIMITS.maxRounds
  ) {
    return {
      error: `A discussion has 1 to ${COUNCIL_LIMITS.maxRounds} rounds.`,
    };
  }
  return {
    request: {
      facilitator: { agentId: facilitator },
      members,
      settings: { defaultMode, ...settings },
      discussion: {
        maxRounds,
        allowAgentResponses: checked(fields, "allowAgentResponses"),
        requireFacilitatorConclusion: checked(
          fields,
          "requireFacilitatorConclusion",
        ),
      },
    },
  };
}

/** The form's fields for a version (the next one starts from it), or the defaults. */
export function fieldsFromVersion(version?: CouncilVersion): CouncilFields {
  const on = (value: boolean) => (value ? "on" : "");
  if (!version) {
    return {
      facilitator: "",
      members: JSON.stringify([]),
      defaultMode: "facilitated",
      allowDirectInteraction: "on",
      allowDiscussion: "on",
      allowPlanning: "on",
      allowDelegation: "",
      requireSynthesis: "on",
      maxRounds: "3",
      allowAgentResponses: "on",
      requireFacilitatorConclusion: "on",
    };
  }
  return {
    facilitator: version.facilitator.agentId,
    members: JSON.stringify(
      version.members.map(
        (member): MemberRow => ({
          agentId: member.agentId,
          participation: member.participation,
          when: member.when ?? "",
          role: member.role ?? "",
        }),
      ),
    ),
    defaultMode: version.settings.defaultMode,
    allowDirectInteraction: on(version.settings.allowDirectInteraction),
    allowDiscussion: on(version.settings.allowDiscussion),
    allowPlanning: on(version.settings.allowPlanning),
    allowDelegation: on(version.settings.allowDelegation),
    requireSynthesis: on(version.settings.requireSynthesis),
    maxRounds: String(version.discussion.maxRounds),
    allowAgentResponses: on(version.discussion.allowAgentResponses),
    requireFacilitatorConclusion: on(
      version.discussion.requireFacilitatorConclusion,
    ),
  };
}

/** The modes a version allows, in words. */
export function allowedModes(settings: CouncilVersion["settings"]): string[] {
  return MODES.filter(
    (mode) =>
      !mode.setting ||
      settings[mode.setting as keyof CouncilVersion["settings"]] === true,
  ).map((mode) => mode.label);
}
