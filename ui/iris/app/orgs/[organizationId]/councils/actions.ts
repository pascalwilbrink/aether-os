"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import {
  archiveCouncil,
  createCouncil,
  createCouncilVersion,
  publishCouncilVersion,
} from "@/lib/api/agora";
import { messageOf as baseMessageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { councilVersionFromForm, KEY_PATTERN } from "@/lib/councils";
import { valuesOf } from "@/lib/forms";

/** What a form shows after a submit. */
export interface FormState {
  error?: string;
  notice?: string;
  values?: Record<string, string>;
}

/** Where a council's page lives. */
export interface CouncilRef {
  organizationId: string;
  councilId: string;
}

const councilPath = ({ organizationId, councilId }: CouncilRef) =>
  `/orgs/${organizationId}/councils/${councilId}`;

const messageOf = (error: unknown) =>
  baseMessageOf(error, {
    FORBIDDEN:
      "You aren't allowed to do that with councils in this organization.",
    COUNCIL_ALREADY_EXISTS:
      "The organization already has a council with that key.",
    COUNCIL_ARCHIVED: "This council is archived: it can't get new versions.",
    COUNCIL_VERSION_INVALID_TRANSITION: "Only a draft can be published.",
    COUNCIL_VERSION_CONFLICT:
      "Someone changed this council at the same time. Try again.",
  });

/** Creates a council (`council:write`), then opens it for its first version. */
export async function createCouncilAction(
  organizationId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/councils/new`,
  );
  const values = valuesOf(form);
  const name = (values.name ?? "").trim();
  const key = (values.key ?? "").trim();
  if (!name) return { error: "Give the council a name.", values };
  if (!KEY_PATTERN.test(key)) {
    return {
      error:
        "The key is lowercase letters, digits and hyphens, starting with a letter (e.g. software-architecture).",
      values,
    };
  }
  let councilId: string;
  try {
    councilId = (
      await createCouncil(session.accessToken, organizationId, {
        key,
        name,
        description: (values.description ?? "").trim(),
      })
    ).id;
  } catch (error) {
    return { error: messageOf(error), values };
  }
  redirect(councilPath({ organizationId, councilId }));
}

/** A new version (versions never change), published at once when asked. */
export async function createCouncilVersionAction(
  ref: CouncilRef,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    councilPath(ref),
  );
  const values = valuesOf(form);
  const parsed = councilVersionFromForm(values);
  if ("error" in parsed) return { error: parsed.error, values };
  let version: number;
  try {
    const created = await createCouncilVersion(
      session.accessToken,
      ref.organizationId,
      ref.councilId,
      parsed.request,
    );
    version = created.version;
    if (values.publish === "on") {
      try {
        await publishCouncilVersion(
          session.accessToken,
          ref.organizationId,
          ref.councilId,
          created.id,
        );
      } catch (error) {
        refresh();
        return {
          error: `Version ${version} was saved as a draft, but not published: ${messageOf(error)}`,
        };
      }
    }
  } catch (error) {
    return { error: messageOf(error), values };
  }
  refresh();
  return {
    notice:
      values.publish === "on"
        ? `Version ${version} is published.`
        : `Version ${version} saved.`,
  };
}

/** Publishes a draft; the published one before it becomes deprecated. */
export async function publishCouncilVersionAction(
  ref: CouncilRef & { versionId: string },
): Promise<{ error?: string }> {
  const session = await requireOrganization(
    ref.organizationId,
    councilPath(ref),
  );
  try {
    await publishCouncilVersion(
      session.accessToken,
      ref.organizationId,
      ref.councilId,
      ref.versionId,
    );
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}

/** Archives the council: no new versions or sessions. */
export async function archiveCouncilAction(
  ref: CouncilRef,
): Promise<{ error?: string }> {
  const session = await requireOrganization(
    ref.organizationId,
    councilPath(ref),
  );
  try {
    await archiveCouncil(
      session.accessToken,
      ref.organizationId,
      ref.councilId,
    );
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}
