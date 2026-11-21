"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import { WRITABLE_TYPES } from "@/lib/knowledge";

import type { FormState, ProjectRef } from "../actions";
import {
  createKnowledgeItemAction,
  updateKnowledgeItemAction,
  uploadKnowledgeDocumentAction,
} from "./actions";

/** Writes a decision, fact, convention, architecture note or lesson. */
export function NewKnowledgeItemForm({ project }: { project: ProjectRef }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createKnowledgeItemAction.bind(null, project),
    {},
  );
  const values = state.values ?? {};
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <label className="block text-sm">
        Kind
        <select
          key={values.type}
          name="type"
          defaultValue={values.type ?? "decision"}
          className={inputClass}
        >
          {WRITABLE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}: {type.hint.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Title
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={values.title}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        What it says (Markdown; for a decision, its context, the decision and
        its consequences)
        <textarea
          name="body"
          required
          rows={6}
          defaultValue={values.body}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Tags (comma-separated, optional)
        <input name="tags" defaultValue={values.tags} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

/** Uploads a document (Markdown, text, CSV, JSON, HTML, PDF and .docx are searchable). */
export function UploadDocumentForm({ project }: { project: ProjectRef }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadKnowledgeDocumentAction.bind(null, project),
    {},
  );
  const values = state.values ?? {};
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <label className="block text-sm">
        File (at most 10 MB)
        <input name="file" type="file" required className={inputClass} />
      </label>
      <label className="block text-sm">
        Title (optional: its file name otherwise)
        <input
          name="title"
          maxLength={200}
          defaultValue={values.title}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Tags (comma-separated, optional)
        <input name="tags" defaultValue={values.tags} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}

/** A new version of a written item. */
export function EditKnowledgeItemForm({
  item,
  defaults,
}: {
  item: ProjectRef & { itemId: string };
  defaults: { title: string; body: string; tags: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateKnowledgeItemAction.bind(null, item),
    {},
  );
  const values = state.values ?? defaults;
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <label className="block text-sm">
        Title
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={values.title}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        What it says (Markdown)
        <textarea
          name="body"
          required
          rows={8}
          defaultValue={values.body}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Tags (comma-separated)
        <input name="tags" defaultValue={values.tags} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save a new version"}
      </button>
    </form>
  );
}
