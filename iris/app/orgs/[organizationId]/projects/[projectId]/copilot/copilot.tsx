"use client";

import "@copilotkit/react-core/v2/styles.css";

import {
  CopilotKitProvider,
  CopilotModalHeader,
  CopilotSidebar,
  defineToolCallRenderer,
  useAgentContext,
  useFrontendTool,
  useHumanInTheLoop,
  type CopilotModalHeaderProps,
} from "@copilotkit/react-core/v2";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { z } from "zod";

import { usePageContexts } from "@/app/components/page-context";
import { useSessionRunEvents } from "@/app/components/session-run-events";
import { storeValue, useStoredValue } from "@/app/components/stored-value";
import {
  copilotAgentOf,
  copilotHref,
  copilotMemoryOf,
  copilotStorageKey,
  taskDraftHref,
  type CopilotMemory,
  type ProjectRef,
  type TaskDraft,
} from "@/lib/copilot";
import { WRITABLE_TYPES } from "@/lib/knowledge";
import { AGENT_HEADER, copilotKitPath, SESSION_HEADER } from "@/lib/sessions";

import { saveCopilotKnowledgeAction } from "./actions";

/** The copilot's agent, as CopilotKit and Iris's runtime know it. */
const AGENT_ID = "session";

export interface CopilotAgentOption {
  id: string;
  name: string;
}

/** The copilot's agent and what its header needs. */
const CopilotState = createContext<{
  agents: CopilotAgentOption[];
  chosen: string | null;
  choose: (agentId: string) => void;
  restart: () => void;
  sessionHref: string | null;
  failure: string | null;
} | null>(null);

function readMemory(projectId: string): CopilotMemory | null {
  try {
    return copilotMemoryOf(localStorage.getItem(copilotStorageKey(projectId)));
  } catch {
    return null;
  }
}

/**
 * The copilot on every project page (docs/interaction.md, "Built: the
 * copilot"): CopilotKit's sidebar, on Iris's runtime (`lib/copilotkit.ts`),
 * talking to a Hephaestus session with an agent the person picks. The
 * runtime starts the session with the first message and announces it; this
 * browser remembers it per project and names it in every request
 * (`x-iris-session`, with the agent in `x-iris-agent`). It sits beside the
 * page (in its own Suspense boundary: CopilotKit's provider reads the clock
 * as it renders), and pages tell it what the person is looking at
 * (`usePageContext`). It may open pages of the project and draft knowledge
 * and tasks, which the person saves or opens with a click.
 */
export function Copilot({
  agents,
}: {
  /** Agents with a published version, to talk to. */
  agents: CopilotAgentOption[];
}) {
  const { organizationId, projectId } = useParams<{
    organizationId: string;
    projectId: string;
  }>();
  const pathname = usePathname();
  const memory = copilotMemoryOf(useStoredValue(copilotStorageKey(projectId)));
  const offered = agents;
  const chosen = copilotAgentOf(memory?.agentId, offered);
  const project = { organizationId, projectId };

  // A session's own page has its own chat: no copilot beside it.
  if (/\/sessions\/[^/]+$/.test(pathname)) return null;

  return (
    <CopilotKitProvider
      runtimeUrl={copilotKitPath(project)}
      headers={{
        [SESSION_HEADER]: memory?.sessionId ?? "",
        [AGENT_HEADER]: chosen ?? "",
      }}
      agentId={AGENT_ID}
      renderToolCalls={TOOL_RENDERERS}
      showDevConsole={false}
      enableInspector={false}
    >
      <CopilotPanel
        project={project}
        path={pathname}
        agents={offered}
        chosen={chosen}
        sessionId={memory?.sessionId ?? null}
      />
    </CopilotKitProvider>
  );
}

/** The sidebar, its tools and context, and the session it remembers (inside the provider). */
function CopilotPanel({
  project,
  path,
  agents,
  chosen,
  sessionId,
}: {
  project: ProjectRef;
  path: string;
  agents: CopilotAgentOption[];
  chosen: string | null;
  sessionId: string | null;
}) {
  const { projectId } = project;
  const [failure, setFailure] = useState<string | null>(null);
  const remember = (memory: CopilotMemory) =>
    storeValue(copilotStorageKey(projectId), JSON.stringify(memory));
  const forget = (agentId = chosen) => {
    agent.setMessages([]);
    if (agentId) remember({ agentId, sessionId: null });
  };
  const agent = useSessionRunEvents(AGENT_ID, {
    onSession: (started) => {
      const agentId = readMemory(projectId)?.agentId ?? chosen;
      if (agentId) remember({ agentId, sessionId: started });
    },
    onFailure: (message) => {
      if (message?.startsWith("This session has ended")) {
        // Idle too long: the next message starts a new conversation.
        forget();
        setFailure("This conversation has ended: send your message again to start a new one.");
        return;
      }
      setFailure(message);
    },
  });

  const state = {
    agents,
    chosen,
    choose: (agentId: string) => forget(agentId),
    restart: () => forget(),
    sessionHref: sessionId
      ? `/orgs/${project.organizationId}/projects/${projectId}/sessions/${sessionId}`
      : null,
    failure,
  };

  return (
    <CopilotState.Provider value={state}>
      <CopilotTools project={project} />
      <PageContext organizationId={project.organizationId} projectId={projectId} path={path} />
      <CopilotSidebar
        agentId={AGENT_ID}
        threadId={`copilot:${projectId}`}
        header={CopilotHeader}
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Copilot",
          chatInputPlaceholder: "Ask about this project",
          welcomeMessageText:
            "Ask about what you're looking at: why a task failed, what the project decided, what to do next. I can open pages, and draft knowledge and tasks for you to save.",
        }}
      />
    </CopilotState.Provider>
  );
}

/** What the person is looking at: where they are, and what the page published. */
function PageContext({
  organizationId,
  projectId,
  path,
}: {
  organizationId: string;
  projectId: string;
  path: string;
}) {
  const published = usePageContexts();
  useAgentContext({
    description: "What the person is looking at in Iris: the page, and what it shows",
    value: {
      organizationId,
      projectId,
      path,
      ...Object.fromEntries(published.map(({ description, value }) => [description, value])),
    } as never,
  });
  return null;
}

/** The sidebar's header: CopilotKit's, then the agent and the conversation. */
function CopilotHeader(props: CopilotModalHeaderProps) {
  const state = useContext(CopilotState);
  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      <CopilotModalHeader {...props} />
      {state && (
        <div className="space-y-1 px-4 pb-3 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-2">
            <AgentPicker />
            <button type="button" onClick={state.restart} className="underline">
              New conversation
            </button>
            {state.sessionHref && (
              <Link href={state.sessionHref} className="underline">
                Open as a session
              </Link>
            )}
          </div>
          {state.failure && (
            <p role="alert" className="text-red-700 dark:text-red-300">
              {state.failure}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AgentPicker() {
  const state = useContext(CopilotState);
  const agents = state!.agents;
  if (agents.length === 0) {
    return <span>No agent has a published version yet.</span>;
  }
  const chosen = state!.chosen;
  return (
    <label className="flex items-center gap-1">
      Agent
      <select
        value={chosen ?? ""}
        onChange={(event) => state!.choose(event.target.value)}
        className="rounded-md border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const KNOWLEDGE_KINDS = WRITABLE_TYPES.map((type) => type.value) as [string, ...string[]];

const openPageArgs = z.object({
  path: z
    .string()
    .describe(
      'A page of this project, relative to it: "" for the project, "tasks/{taskId}", "knowledge", "knowledge/{itemId}", "sessions", "automations/{automationId}" or "templates/{templateId}".',
    ),
});

const knowledgeArgs = z.object({
  type: z.enum(KNOWLEDGE_KINDS).describe("What kind of knowledge it is."),
  title: z.string().describe("A short title."),
  body: z.string().describe("What it says, in Markdown."),
  tags: z.array(z.string()).optional().describe("Tags, if any."),
});

const taskArgs = z.object({
  title: z.string().describe("The task's title."),
  description: z.string().optional().describe("What to do and why."),
  expectedOutcome: z.string().optional().describe("What done looks like."),
  requirements: z.array(z.string()).optional().describe("What must be implemented, one each."),
  constraints: z.array(z.string()).optional().describe("Limits on how, one each."),
});

/** What the copilot may do in Iris: each with the person's own click where it changes anything. */
function CopilotTools({ project }: { project: ProjectRef }) {
  const router = useRouter();

  useFrontendTool(
    {
      name: "open_page",
      description:
        "Opens a page of this project in Iris for the person, e.g. a task you mentioned. It only navigates.",
      parameters: openPageArgs,
      handler: async ({ path }) => {
        const target = copilotHref(project, path);
        if ("error" in target) return target.error;
        router.push(target.href);
        return `Opened ${target.href}.`;
      },
    },
    [project, router],
  );

  useHumanInTheLoop(
    {
      name: "draft_knowledge",
      description:
        "Drafts a knowledge item for this project (a decision, convention, fact, architecture note or lesson). The person sees it and saves it or not; the result says which.",
      parameters: knowledgeArgs,
      render: (props) => <KnowledgeCard project={project} {...props} />,
    },
    [project],
  );

  useHumanInTheLoop(
    {
      name: "draft_task",
      description:
        "Drafts a task for this project. The person sees it and opens it in the new-task form, where they choose the agent and submit it, or discards it; the result says which. You never create tasks yourself.",
      parameters: taskArgs,
      render: (props) => <TaskCard project={project} {...props} />,
    },
    [project],
  );

  return null;
}

type CardProps<T> = {
  args: Partial<T>;
  status: string;
  result?: string;
  respond?: (result: unknown) => Promise<void>;
};

const cardClass =
  "my-2 space-y-2 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-700";
const smallButton =
  "rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800";

function KnowledgeCard({
  project,
  args,
  status,
  result,
  respond,
}: CardProps<z.infer<typeof knowledgeArgs>> & { project: ProjectRef }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    const saved = await saveCopilotKnowledgeAction(project, args);
    setSaving(false);
    if ("error" in saved) {
      setError(saved.error);
      return;
    }
    await respond?.({ saved: true, id: saved.id, href: saved.href });
  };
  return (
    <div className={cardClass}>
      <p className="text-xs font-medium text-zinc-500">
        Knowledge draft{args.type ? ` · ${args.type}` : ""}
      </p>
      <p className="font-medium">{args.title ?? "…"}</p>
      <p className="whitespace-pre-wrap">{args.body ?? ""}</p>
      {args.tags?.length ? (
        <p className="text-xs text-zinc-500">Tags: {args.tags.join(", ")}</p>
      ) : null}
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {status === "executing" && respond ? (
        <div className="flex gap-2">
          <button type="button" className={smallButton} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={smallButton}
            disabled={saving}
            onClick={() =>
              respond({ saved: false, reason: error ?? "The person discarded it." })
            }
          >
            Discard
          </button>
        </div>
      ) : status === "complete" ? (
        <p className="text-xs text-zinc-500">{outcomeOf(result, "Saved.", "Not saved.")}</p>
      ) : null}
    </div>
  );
}

function TaskCard({
  project,
  args,
  status,
  result,
  respond,
}: CardProps<z.infer<typeof taskArgs>> & { project: ProjectRef }) {
  const router = useRouter();
  const open = async () => {
    router.push(taskDraftHref(project, args as TaskDraft));
    await respond?.({ opened: true });
  };
  return (
    <div className={cardClass}>
      <p className="text-xs font-medium text-zinc-500">Task draft</p>
      <p className="font-medium">{args.title ?? "…"}</p>
      {args.description && <p className="whitespace-pre-wrap">{args.description}</p>}
      {args.requirements?.length ? (
        <ul className="list-disc pl-5">
          {args.requirements.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}
      {status === "executing" && respond ? (
        <div className="flex gap-2">
          <button type="button" className={smallButton} onClick={open}>
            Open in the new-task form
          </button>
          <button
            type="button"
            className={smallButton}
            onClick={() => respond({ opened: false, reason: "The person discarded it." })}
          >
            Discard
          </button>
        </div>
      ) : status === "complete" ? (
        <p className="text-xs text-zinc-500">
          {outcomeOf(result, "Opened in the new-task form.", "Discarded.")}
        </p>
      ) : null}
    </div>
  );
}

/** A card's answer, in words, from the tool result it gave. */
function outcomeOf(result: string | undefined, yes: string, no: string): string {
  try {
    const value = JSON.parse(result ?? "{}") as { saved?: boolean; opened?: boolean };
    return value.saved || value.opened ? yes : no;
  } catch {
    return no;
  }
}

/** The agent's other tool calls (its tool servers, knowledge search), folded. */
const TOOL_RENDERERS = [
  defineToolCallRenderer({
    name: "*",
    render: ({ name, args, status }) => (
      <details className="my-1 text-xs text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer">
          {name === "open_page" ? "Opened a page" : `Used ${name}`}
          {status === "complete" ? "" : "…"}
        </summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(args, null, 2)}
        </pre>
      </details>
    ),
  }),
];
