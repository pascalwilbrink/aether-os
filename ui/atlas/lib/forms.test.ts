import { describe, expect, it } from "vitest";

import { departmentIdsOf, optionalTextOf, textOf, valuesOf } from "./forms";

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};

describe("forms", () => {
  it("reads trimmed text, and empty optional text as null", () => {
    const data = form([
      ["name", "  Platform "],
      ["role", "   "],
    ]);
    expect(textOf(data, "name")).toBe("Platform");
    expect(textOf(data, "missing")).toBe("");
    expect(optionalTextOf(data, "role")).toBeNull();
    expect(optionalTextOf(data, "name")).toBe("Platform");
  });

  it("reads the checked departments once each", () => {
    expect(
      departmentIdsOf(
        form([
          ["departmentIds", "a"],
          ["departmentIds", "b"],
          ["departmentIds", "a"],
        ]),
      ),
    ).toEqual(["a", "b"]);
  });

  it("keeps what was submitted, without React's own fields", () => {
    expect(
      valuesOf(
        form([
          ["name", "Ada"],
          ["departmentIds", "a"],
          ["$ACTION_ID_1", ""],
        ]),
      ),
    ).toEqual({ text: { name: "Ada" }, departmentIds: ["a"] });
  });
});
