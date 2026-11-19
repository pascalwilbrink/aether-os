import { describe, expect, it } from "vitest";

import { authLabel, toolFieldsOf, toolServerFromForm, toolsFromForm } from "./tool-servers";

describe("toolServerFromForm", () => {
  const base = { name: " Docs ", url: " https://tools.example.com/mcp ", authType: "none", description: " Ours " };

  it("builds the request", () => {
    expect(toolServerFromForm(base, { creating: true })).toEqual({
      body: { name: "docs", description: "Ours", url: "https://tools.example.com/mcp", auth: { type: "none" } },
    });
    expect(toolServerFromForm({ ...base, authType: "header" }, { creating: true })).toMatchObject({
      body: { auth: { type: "header", headerName: "Authorization" } },
    });
    expect(
      toolServerFromForm({ ...base, authType: "header", headerName: "X-Api-Key" }, { creating: true }),
    ).toMatchObject({ body: { auth: { type: "header", headerName: "X-Api-Key" } } });
    // Editing keeps the name: it isn't checked.
    expect(toolServerFromForm({ ...base, name: "" }, { creating: false })).toMatchObject({ body: { url: base.url.trim() } });
  });

  it.each([
    [{ ...base, name: "1docs" }, "A name is lowercase letters"],
    [{ ...base, name: "my_docs" }, "A name is lowercase letters"],
    [{ ...base, url: "tools.example.com" }, "The URL is the server's MCP endpoint"],
    [{ ...base, authType: "magic" }, "Choose how Aether-os signs in"],
    [{ ...base, authType: "header", headerName: "X Api" }, "A header name is"],
  ])("refuses %o", (fields, error) => {
    const result = toolServerFromForm(fields, { creating: true });
    expect("error" in result && result.error).toContain(error);
  });
});

describe("tools on the version form", () => {
  it("round-trips a version's enabled tools", () => {
    const tools = [
      { name: "docs", enabled: true, tools: ["lookup", "search"] },
      { name: "seshat", enabled: true },
    ];
    expect(toolsFromForm(toolFieldsOf([...tools, { name: "old", enabled: false }]))).toEqual({ tools });
  });

  it("takes all of a server's tools when none are named", () => {
    expect(toolsFromForm({ "tool:docs": "on", "toolNames:docs": " , " })).toEqual({
      tools: [{ name: "docs", enabled: true }],
    });
    expect(toolsFromForm({ "toolNames:docs": "lookup" })).toEqual({ tools: [] });
  });
});

describe("authLabel", () => {
  it("names how a server is signed in to", () => {
    expect(authLabel({ auth: { type: "header", headerName: "X-Api-Key" } })).toBe("Header X-Api-Key");
    expect(authLabel({ auth: { type: "task-token", headerName: null } })).toBe("The task's own token");
  });
});
