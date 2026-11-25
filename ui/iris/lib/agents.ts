import type { AgentVersion, AgoraSchema, Model } from "./api";
import { skillFieldsOf, skillsFromForm } from "./skills";
import { toolFieldsOf, toolsFromForm } from "./tool-servers";

export type AgentVersionStatus = AgoraSchema<"AgentVersionStatus">;
export type NewAgentVersion = AgoraSchema<"CreateAgentVersionRequest">;

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  mistral: "Mistral",
  ollama: "Ollama (your server)",
};

/** A model as the version form's `model` field holds it: `provider/model`. */
export const modelValue = (model: { provider: string; model: string }) =>
  `${model.provider}/${model.model}`;

/** `"2.500000"` → `"2.5"`: a price per million tokens, as people read it. */
export function formatPrice(price: string): string {
  return price.includes(".") ? price.replace(/\.?0+$/, "") : price;
}

export interface ModelChoice {
  value: string;
  label: string;
}

export interface ModelGroup {
  provider: string;
  label: string;
  options: ModelChoice[];
}

/**
 * The catalogue's active models for the version form: one group per
 * provider (by its name), each model by name with its price per million
 * tokens (input / output). `unavailable` is the starting model when it isn't
 * one of them (deprecated or retired since): the form can't offer it.
 */
/**
 * The model select's options: the catalogue's active models by provider,
 * and the models of the organization's Ollama server (`ollamaModels`; not
 * in the catalogue, unpriced). A version's model that's neither is
 * `unavailable`, except an Ollama one the server no longer lists, which
 * stays a choice.
 */
export function modelChoices(
  models: Model[],
  current: string,
  ollamaModels: string[] = [],
): { groups: ModelGroup[]; unavailable: string | null } {
  const groups = new Map<string, ModelChoice[]>();
  for (const model of models) {
    const price = model.price
      ? ` · $${formatPrice(model.price.inputPerMTok)} / $${formatPrice(model.price.outputPerMTok)} per M tokens`
      : "";
    const options = groups.get(model.provider) ?? [];
    options.push({ value: modelValue(model), label: `${model.name}${price}` });
    groups.set(model.provider, options);
  }
  const ollama = [
    ...new Set([
      ...ollamaModels,
      ...(current.startsWith("ollama/") ? [current.slice(7)] : []),
    ]),
  ];
  if (ollama.length > 0) {
    groups.set(
      "ollama",
      ollama.map((name) => ({
        value: `ollama/${name}`,
        label: `${name} · unpriced`,
      })),
    );
  }
  const label = (provider: string) => PROVIDER_NAMES[provider] ?? provider;
  return {
    groups: [...groups.entries()]
      .map(([provider, options]) => ({
        provider,
        label: label(provider),
        options,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    unavailable:
      current &&
      !current.startsWith("ollama/") &&
      !models.some((model) => modelValue(model) === current)
        ? current
        : null,
  };
}

/** A host an agent's sandbox may reach (the API's `HostPattern`). */
const HOST =
  /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** The runtime new versions get; Hephaestus runs every version with its configured runtime. */
export const DEFAULT_RUNTIME_PROVIDER = "mastra";

const VERSION_STATUS: Record<
  AgentVersionStatus,
  { label: string; classes: string }
> = {
  draft: {
    label: "Draft",
    classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  published: {
    label: "Published",
    classes:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  deprecated: {
    label: "Deprecated",
    classes:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
};

export const versionStatusLabel = (status: AgentVersionStatus) =>
  VERSION_STATUS[status].label;
export const versionStatusClasses = (status: AgentVersionStatus) =>
  VERSION_STATUS[status].classes;

/** Only a draft can be published (publishing the published one changes nothing). */
export const canPublish = (version: Pick<AgentVersion, "status">) =>
  version.status === "draft";

/**
 * The version form's fields for a version (the next one starts from it),
 * or a first version's defaults.
 */
export function fieldsOf(
  version: AgentVersion | undefined,
): Record<string, string> {
  return {
    instructions: version?.instructions ?? "",
    model: version ? modelValue(version.model) : "",
    temperature: version?.model.temperature?.toString() ?? "",
    maxTokens: version?.model.maxTokens?.toString() ?? "",
    executionMode: version?.runtime.executionMode ?? "standard",
    capabilities: version?.capabilities.join(", ") ?? "",
    sandboxRequired: version?.runtime.sandboxRequired ? "on" : "",
    networkAccess: version?.runtime.networkAccess ?? "none",
    allowedHosts: (version?.runtime.allowedHosts ?? []).join("\n"),
    runtimeProvider: version?.runtime.provider ?? DEFAULT_RUNTIME_PROVIDER,
    ...toolFieldsOf(version?.tools ?? []),
    ...skillFieldsOf(version?.skills ?? []),
  };
}

/** Field values as a form sends them. */
export type FormFields = Record<string, string | undefined>;

/**
 * The request for a new version from the form's fields, or what's wrong
 * with them. Tools are the checked tool servers (`toolsFromForm`), skills
 * the checked skills at their chosen versions (`skillsFromForm`).
 */
export function versionFromForm(
  fields: FormFields,
): { body: NewAgentVersion } | { error: string } {
  const value = (name: string) => (fields[name] ?? "").trim();
  const instructions = value("instructions");
  // `provider/model` (from the catalogue): the provider has no slash, a model ID might.
  const chosen = value("model");
  const slash = chosen.indexOf("/");
  const provider = chosen.slice(0, slash);
  const model = chosen.slice(slash + 1);
  if (!instructions) return { error: "Write the agent's instructions." };
  if (slash < 1 || !model) return { error: "Choose a model." };

  const body: NewAgentVersion = {
    instructions,
    model: { provider, model },
    capabilities: value("capabilities")
      .split(",")
      .map((capability) => capability.trim())
      .filter(
        (capability, index, all) =>
          capability && all.indexOf(capability) === index,
      ),
    tools: [],
    skills: [],
    runtime: {
      provider: value("runtimeProvider") || DEFAULT_RUNTIME_PROVIDER,
      executionMode:
        value("executionMode") === "coding" ? "coding" : "standard",
      sandboxRequired: value("sandboxRequired") === "on",
    },
  };

  if (value("networkAccess") === "restricted") {
    const hosts = [
      ...new Set(
        value("allowedHosts")
          .split(/[\s,]+/)
          .map((host) => host.toLowerCase())
          .filter(Boolean),
      ),
    ];
    const invalid = hosts.find((host) => !HOST.test(host));
    if (invalid)
      return {
        error: `"${invalid}" isn't a host name (e.g. api.example.com, or *.example.com).`,
      };
    body.runtime.networkAccess = "restricted";
    body.runtime.allowedHosts = hosts;
  }

  const temperature = value("temperature");
  if (temperature) {
    const number = Number(temperature);
    if (!Number.isFinite(number) || number < 0 || number > 2) {
      return { error: "Temperature is a number from 0 to 2." };
    }
    body.model.temperature = number;
  }
  const maxTokens = value("maxTokens");
  if (maxTokens) {
    const number = Number(maxTokens);
    if (!Number.isInteger(number) || number < 1) {
      return { error: "Max tokens is a whole number above 0." };
    }
    body.model.maxTokens = number;
  }

  const tools = toolsFromForm(fields);
  if ("error" in tools) return tools;
  body.tools = tools.tools;

  const skills = skillsFromForm(fields);
  if ("error" in skills) return skills;
  body.skills = skills.skills;
  return { body };
}
