"use client";

import { useActionState, useState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import type { ToolServer } from "@/lib/api";
import { AUTH_TYPES } from "@/lib/tool-servers";

import type { ToolServerFormState } from "./actions";

type Action = (state: ToolServerFormState, form: FormData) => Promise<ToolServerFormState>;

/** A new tool server, or an existing one's settings (its name stays). */
export function ToolServerForm({ action, server }: { action: Action; server?: ToolServer }) {
  const [state, formAction, pending] = useActionState(action, {});
  const start = state.values ?? {
    name: server?.name ?? "",
    description: server?.description ?? "",
    url: server?.url ?? "",
    authType: server?.auth.type ?? "none",
    headerName: server?.auth.headerName ?? "",
  };
  const [authType, setAuthType] = useState(start.authType ?? "none");
  return (
    <form action={formAction} className="max-w-xl space-y-3">
      <FormError error={state.error} />
      {state.notice ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {state.notice}
        </p>
      ) : null}
      {server ? null : (
        <label className="block text-sm">
          Name <span className="text-zinc-500">(agents see its tools as name_tool)</span>
          <input
            name="name"
            required
            maxLength={30}
            pattern="[a-z][a-z0-9\-]*"
            placeholder="docs"
            defaultValue={start.name}
            className={`${inputClass} font-mono`}
          />
        </label>
      )}
      <label className="block text-sm">
        MCP endpoint
        <input
          name="url"
          type="url"
          required
          placeholder="https://tools.example.com/mcp"
          defaultValue={start.url}
          className={`${inputClass} font-mono`}
        />
      </label>
      <label className="block text-sm">
        Description
        <input name="description" maxLength={500} defaultValue={start.description} className={inputClass} />
      </label>
      <fieldset className="space-y-1 text-sm">
        <legend>How Aether-os signs in</legend>
        {AUTH_TYPES.map((auth) => (
          <label key={auth.value} className="flex items-start gap-2">
            <input
              type="radio"
              name="authType"
              value={auth.value}
              checked={authType === auth.value}
              onChange={() => setAuthType(auth.value)}
              className="mt-1"
            />
            <span>
              {auth.label}
              <span className="block text-xs text-zinc-500">{auth.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {authType === "header" ? (
        <label className="block text-sm">
          Header
          <input
            name="headerName"
            placeholder="Authorization"
            defaultValue={start.headerName}
            className={`${inputClass} font-mono`}
          />
        </label>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : server ? "Save" : "Add tool server"}
      </button>
    </form>
  );
}
