export interface TraceViewers {
  jaegerUrl: string | null;
  langfuseUrl: string | null;
  langfuseProjectId: string | null;
}

/**
 * Where an execution's trace can be seen: Jaeger (every span: the runner,
 * HTTP and database calls, the agent) and Langfuse (the agent's run, model
 * and tool calls). None without a trace or a configured viewer.
 */
export function traceLinks(
  traceId: string | null,
  viewers: TraceViewers,
): { label: string; href: string }[] {
  if (!traceId || !/^[0-9a-f]{32}$/.test(traceId)) {
    return [];
  }
  const base = (url: string) => url.replace(/\/+$/, "");
  const links: { label: string; href: string }[] = [];
  if (viewers.langfuseUrl && viewers.langfuseProjectId) {
    links.push({
      label: "Langfuse",
      href: `${base(viewers.langfuseUrl)}/project/${encodeURIComponent(viewers.langfuseProjectId)}/traces/${traceId}`,
    });
  }
  if (viewers.jaegerUrl) {
    links.push({
      label: "Jaeger",
      href: `${base(viewers.jaegerUrl)}/trace/${traceId}`,
    });
  }
  return links;
}
