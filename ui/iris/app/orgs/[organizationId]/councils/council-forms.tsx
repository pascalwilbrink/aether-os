"use client";

import { useActionState, useState } from "react";

import { buttonClass, FormError, inputClass } from "@aether-os/design";
import {
  COUNCIL_LIMITS,
  keyFromName,
  MODES,
  PARTICIPATION,
  type CouncilFields,
  type MemberRow,
} from "@/lib/councils";

import {
  createCouncilAction,
  createCouncilVersionAction,
  type CouncilRef,
  type FormState,
} from "./actions";

interface AgentOption {
  id: string;
  name: string;
}

/** A new council: its name, key (suggested from the name) and what it's for. */
export function NewCouncilForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createCouncilAction.bind(null, organizationId),
    {},
  );
  const [name, setName] = useState(state.values?.name ?? "");
  const [key, setKey] = useState(state.values?.key ?? "");
  const [keyEdited, setKeyEdited] = useState(Boolean(state.values?.key));
  return (
    <form action={action} className="max-w-xl space-y-3">
      <FormError error={state.error} />
      <label className="block text-sm">
        Name
        <input
          name="name"
          required
          maxLength={200}
          placeholder="Software Architecture Council"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!keyEdited) setKey(keyFromName(event.target.value));
          }}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Key <span className="text-zinc-500">(unique in the organization)</span>
        <input
          name="key"
          required
          maxLength={63}
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setKeyEdited(true);
          }}
          className={`${inputClass} font-mono`}
        />
      </label>
      <label className="block text-sm">
        What it&apos;s for
        <textarea
          name="description"
          maxLength={2000}
          rows={3}
          defaultValue={state.values?.description}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create council"}
      </button>
    </form>
  );
}

const emptyMember = (): MemberRow => ({
  agentId: "",
  participation: "required",
  when: "",
  role: "",
});

/** The council's members: a row each, sent as JSON in `members`. */
function MembersEditor({
  initial,
  agents,
}: {
  initial: string | undefined;
  agents: AgentOption[];
}) {
  const [rows, setRows] = useState<MemberRow[]>(() => {
    try {
      const parsed = JSON.parse(initial || "[]") as MemberRow[];
      return parsed.length > 0 ? parsed : [emptyMember()];
    } catch {
      return [emptyMember()];
    }
  });
  const update = (index: number, change: Partial<MemberRow>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...change } : row)),
    );
  return (
    <fieldset className="text-sm">
      <legend>Members</legend>
      <input type="hidden" name="members" value={JSON.stringify(rows)} />
      <p className="text-xs text-zinc-500">
        Agents of the organization with a published version. The facilitator
        decides who takes part: required members always do, conditional ones
        when what you describe applies, optional ones only when invited.
      </p>
      <ul className="mt-2 space-y-2">
        {rows.map((row, index) => (
          <li
            key={index}
            className="grid gap-2 rounded-md border border-zinc-200 p-2 sm:grid-cols-[1fr_12rem] dark:border-zinc-800"
          >
            <select
              aria-label="Agent"
              value={row.agentId}
              onChange={(event) =>
                update(index, { agentId: event.target.value })
              }
              className={`${inputClass} mt-0`}
            >
              <option value="">Choose an agent…</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Takes part"
              value={row.participation}
              onChange={(event) =>
                update(index, {
                  participation: event.target
                    .value as MemberRow["participation"],
                })
              }
              className={`${inputClass} mt-0`}
            >
              {PARTICIPATION.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}: {entry.hint}
                </option>
              ))}
            </select>
            {row.participation === "conditional" ? (
              <input
                aria-label="When it takes part"
                placeholder="When it takes part, e.g. authentication or data handling"
                value={row.when}
                onChange={(event) =>
                  update(index, { when: event.target.value })
                }
                className={`${inputClass} mt-0 sm:col-span-2`}
              />
            ) : null}
            <input
              aria-label="Its role here"
              placeholder="Its role in this council (optional), e.g. challenges assumptions"
              value={row.role}
              onChange={(event) => update(index, { role: event.target.value })}
              className={`${inputClass} mt-0 sm:col-span-2`}
            />
            <button
              type="button"
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
              className="justify-self-start text-zinc-500 underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {rows.length < COUNCIL_LIMITS.members ? (
        <button
          type="button"
          onClick={() => setRows((current) => [...current, emptyMember()])}
          className="mt-2 underline"
        >
          Add a member
        </button>
      ) : null}
    </fieldset>
  );
}

const SETTINGS = [
  ["allowDirectInteraction", "People can address one member directly"],
  ["allowDiscussion", "Deliberation rounds"],
  ["allowPlanning", "Planning (plans are always reviewed by a person)"],
  ["allowDelegation", "Delegation (approved plans become tasks)"],
  ["requireSynthesis", "The facilitator writes a synthesis"],
] as const;

/** A council version: facilitator, members, ways of working and discussion limits. */
export function CouncilVersionForm({
  council,
  agents,
  defaults,
}: {
  council: CouncilRef;
  agents: AgentOption[];
  defaults: CouncilFields;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createCouncilVersionAction.bind(null, council),
    {},
  );
  const values = state.values ?? defaults;
  const text = (name: string) => values[name] ?? "";
  return (
    <form action={action} className="space-y-4">
      <FormError error={state.error} />
      {state.notice ? (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {state.notice}
        </p>
      ) : null}
      <label className="block text-sm">
        Facilitator{" "}
        <span className="text-zinc-500">
          (leads the conversation, decides who takes part, concludes)
        </span>
        <select
          key={text("facilitator")}
          name="facilitator"
          defaultValue={text("facilitator")}
          className={inputClass}
        >
          <option value="">Choose an agent…</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>
      <MembersEditor
        key={`members-${text("members")}`}
        initial={text("members")}
        agents={agents}
      />
      <fieldset className="space-y-1 text-sm">
        <legend>Ways of working</legend>
        {SETTINGS.map(([name, label]) => (
          <label key={name} className="flex items-center gap-2">
            <input
              type="checkbox"
              name={name}
              defaultChecked={text(name) === "on"}
            />
            {label}
          </label>
        ))}
        <label className="mt-2 block">
          Default mode
          <select
            key={text("defaultMode")}
            name="defaultMode"
            defaultValue={text("defaultMode") || "facilitated"}
            className={inputClass}
          >
            {MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset className="space-y-1 text-sm">
        <legend>Discussions</legend>
        <label className="block">
          Rounds at most
          <input
            name="maxRounds"
            type="number"
            min={1}
            max={COUNCIL_LIMITS.maxRounds}
            defaultValue={text("maxRounds") || "3"}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="allowAgentResponses"
            defaultChecked={text("allowAgentResponses") === "on"}
          />
          Members see earlier answers in a round and can respond to them
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="requireFacilitatorConclusion"
            defaultChecked={text("requireFacilitatorConclusion") === "on"}
          />
          A round ends with the facilitator&apos;s conclusion
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="publish" /> Publish it (new sessions use
        it)
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save version"}
      </button>
    </form>
  );
}
