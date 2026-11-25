import { describe, expect, it } from "vitest";

import {
  allowedModes,
  councilVersionFromForm,
  fieldsFromVersion,
  keyFromName,
  type CouncilVersion,
} from "./councils";

const base = {
  ...fieldsFromVersion(),
  facilitator: "f",
  members: JSON.stringify([
    { agentId: "a", participation: "required", when: "", role: "" },
    {
      agentId: "b",
      participation: "conditional",
      when: "Security questions",
      role: "Reviews threats",
    },
    { agentId: "", participation: "required", when: "", role: "" },
  ]),
};

describe("councils", () => {
  it("suggests a key from the name", () => {
    expect(keyFromName("Software Architecture Council")).toBe(
      "software-architecture-council",
    );
    expect(keyFromName("  2024 Security!! ")).toBe("security");
  });

  it("builds a version from its form, leaving empty rows out", () => {
    expect(councilVersionFromForm(base)).toEqual({
      request: {
        facilitator: { agentId: "f" },
        members: [
          { agentId: "a", participation: "required" },
          {
            agentId: "b",
            participation: "conditional",
            when: "Security questions",
            role: "Reviews threats",
          },
        ],
        settings: {
          defaultMode: "facilitated",
          allowDirectInteraction: true,
          allowDiscussion: true,
          allowPlanning: true,
          allowDelegation: false,
          requireSynthesis: true,
        },
        discussion: {
          maxRounds: 3,
          allowAgentResponses: true,
          requireFacilitatorConclusion: true,
        },
      },
    });
  });

  it.each([
    [{ facilitator: "" }, "Choose the facilitator"],
    [{ members: "[]" }, "at least one member"],
    [
      {
        members: JSON.stringify([{ agentId: "f", participation: "required" }]),
      },
      "can't also be a member",
    ],
    [
      {
        members: JSON.stringify([
          { agentId: "a", participation: "required" },
          { agentId: "a", participation: "optional" },
        ]),
      },
      "member once",
    ],
    [
      {
        members: JSON.stringify([
          { agentId: "a", participation: "conditional" },
        ]),
      },
      "Say when",
    ],
    [{ defaultMode: "discussion", allowDiscussion: "" }, "has to be allowed"],
    [{ maxRounds: "11" }, "1 to 10 rounds"],
  ])("refuses %j", (change, error) => {
    const result = councilVersionFromForm({ ...base, ...change });
    expect("error" in result && result.error).toContain(error);
  });

  it("starts the next version from the latest", () => {
    const { request } = councilVersionFromForm(base) as {
      request: CouncilVersion;
    };
    const version = { ...request, id: "v", version: 1 } as CouncilVersion;
    expect(councilVersionFromForm(fieldsFromVersion(version))).toEqual({
      request,
    });
    expect(allowedModes(version.settings)).toEqual([
      "Facilitated",
      "Direct",
      "Discussion",
      "Planning",
    ]);
  });
});
