import { describe, expect, it } from "vitest";

import { traceLinks } from "./traces";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";

describe("traceLinks", () => {
  it("links Langfuse and Jaeger when configured", () => {
    expect(
      traceLinks(TRACE, {
        jaegerUrl: "http://localhost:16686/",
        langfuseUrl: "http://localhost:3100",
        langfuseProjectId: "aether-os-local",
      }),
    ).toEqual([
      {
        label: "Langfuse",
        href: `http://localhost:3100/project/aether-os-local/traces/${TRACE}`,
      },
      { label: "Jaeger", href: `http://localhost:16686/trace/${TRACE}` },
    ]);
  });

  it("links nothing without a trace or a viewer", () => {
    const none = {
      jaegerUrl: null,
      langfuseUrl: null,
      langfuseProjectId: null,
    };
    expect(traceLinks(TRACE, none)).toEqual([]);
    expect(traceLinks(null, { ...none, jaegerUrl: "http://j" })).toEqual([]);
    expect(
      traceLinks("not-a-trace", { ...none, jaegerUrl: "http://j" }),
    ).toEqual([]);
    // Langfuse needs its project too.
    expect(traceLinks(TRACE, { ...none, langfuseUrl: "http://l" })).toEqual([]);
  });
});
