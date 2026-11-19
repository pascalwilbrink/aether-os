import type { ApiSchema, ToolServer } from "./api";

export type ToolServerAuthType = ApiSchema<"ToolServerAuthType">;
export type AgentTool = ApiSchema<"AgentToolConfiguration">;

/** The form's fields (see `versionFromForm`): `tool:<server>` checked, `toolNames:<server>` its tools. */
export const TOOL_FIELD = "tool:";
export const TOOL_NAMES_FIELD = "toolNames:";

const SERVER_NAME = /^[a-z][a-z0-9-]{0,29}$/;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;

export const AUTH_TYPES: { value: ToolServerAuthType; label: string; text: string }[] = [
  { value: "none", label: "None", text: "The server needs no credential." },
  {
    value: "header",
    label: "A credential in a header",
    text: "An API key or token, sent in the header you name (Authorization by default: include “Bearer ”).",
  },
  {
    value: "task-token",
    label: "The task's own token",
    text: "For Aether-os's own servers, such as Seshat: each task sends its own token, limited to its project.",
  },
];

export const authLabel = (server: Pick<ToolServer, "auth">) =>
  server.auth.type === "header"
    ? `Header ${server.auth.headerName}`
    : (AUTH_TYPES.find((type) => type.value === server.auth.type)?.label ?? server.auth.type);

/** Fields as a form sends them. */
type Fields = Record<string, string | undefined>;

/** A tool server's settings from its form, or what's wrong with them. */
export function toolServerFromForm(
  fields: Fields,
  { creating }: { creating: boolean },
): { body: ApiSchema<"CreateToolServerRequest"> } | { error: string } {
  const value = (name: string) => (fields[name] ?? "").trim();
  const name = value("name").toLowerCase();
  if (creating && !SERVER_NAME.test(name)) {
    return {
      error:
        "A name is lowercase letters, digits and hyphens, starting with a letter (at most 30): agents see its tools as <name>_<tool>.",
    };
  }
  const url = value("url");
  if (!/^https?:\/\//.test(url)) {
    return { error: "The URL is the server's MCP endpoint, starting with https://." };
  }
  try {
    new URL(url);
  } catch {
    return { error: `${url} isn't a URL.` };
  }
  const type = value("authType") as ToolServerAuthType;
  if (!AUTH_TYPES.some((auth) => auth.value === type)) {
    return { error: "Choose how Aether-os signs in to the server." };
  }
  const auth: ApiSchema<"ToolServerAuth"> = { type };
  if (type === "header") {
    const headerName = value("headerName") || "Authorization";
    if (!HEADER_NAME.test(headerName)) {
      return { error: "A header name is letters, digits and hyphens." };
    }
    auth.headerName = headerName;
  }
  return { body: { name, description: value("description"), url, auth } };
}

/** The form's fields for a version's tools. */
export function toolFieldsOf(tools: AgentTool[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const tool of tools) {
    if (!tool.enabled) continue;
    fields[`${TOOL_FIELD}${tool.name}`] = "on";
    fields[`${TOOL_NAMES_FIELD}${tool.name}`] = (tool.tools ?? []).join(", ");
  }
  return fields;
}

/**
 * A version's tools from the form: each checked server, with the tools
 * named for it (all of them when none are), or what's wrong.
 */
export function toolsFromForm(fields: Fields): { tools: AgentTool[] } | { error: string } {
  const tools: AgentTool[] = [];
  for (const [key, checked] of Object.entries(fields)) {
    if (!key.startsWith(TOOL_FIELD) || checked !== "on") continue;
    const name = key.slice(TOOL_FIELD.length);
    const names = [
      ...new Set(
        (fields[`${TOOL_NAMES_FIELD}${name}`] ?? "")
          .split(/[\s,]+/)
          .map((tool) => tool.trim())
          .filter(Boolean),
      ),
    ];
    const invalid = names.find((tool) => !TOOL_NAME.test(tool));
    if (invalid) return { error: `"${invalid}" isn't a tool name (letters, digits, _ . and -).` };
    tools.push(names.length > 0 ? { name, enabled: true, tools: names } : { name, enabled: true });
  }
  return { tools: tools.sort((a, b) => a.name.localeCompare(b.name)) };
}
