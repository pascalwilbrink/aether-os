"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import {
  changeAutomationStatus,
  createAutomation,
  updateAutomation,
} from "@/lib/api/kairos";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { requestOf } from "@/lib/automations";
import { valuesOf } from "@/lib/forms";

import type { FormState, ProjectRef } from "../actions";

const automationsPath = ({ organizationId, projectId }: ProjectRef) =>
  `/orgs/${organizationId}/projects/${projectId}/automations`;

const kairosMessageOf = (error: unknown) =>
  messageOf(error, {
    FORBIDDEN:
      "Only the project's admins (the organization's owners and admins) manage automations.",
    PROJECT_ARCHIVED: "The project is archived.",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
    AUTOMATION_ARCHIVED: "The automation is archived and can't change.",
    VALIDATION_FAILED:
      "Some fields aren't valid: a task's text can only use the fields listed under it.",
  });

/** Creates an automation (`automation:manage`), then opens it. */
export async function createAutomationAction(
  ref: ProjectRef,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    `${automationsPath(ref)}/new`,
  );
  const values = valuesOf(form);
  const parsed = requestOf(values);
  if ("error" in parsed) {
    return { error: parsed.error, values };
  }
  let id: string;
  try {
    id = (
      await createAutomation(
        session.accessToken,
        ref.organizationId,
        ref.projectId,
        parsed.request,
      )
    ).id;
  } catch (error) {
    return { error: kairosMessageOf(error), values };
  }
  redirect(`${automationsPath(ref)}/${id}`);
}

/** Replaces an automation's trigger and task. */
export async function updateAutomationAction(
  ref: ProjectRef & { automationId: string },
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    `${automationsPath(ref)}/${ref.automationId}`,
  );
  const values = valuesOf(form);
  const parsed = requestOf(values);
  if ("error" in parsed) {
    return { error: parsed.error, values };
  }
  try {
    await updateAutomation(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.automationId,
      parsed.request,
    );
  } catch (error) {
    return { error: kairosMessageOf(error), values };
  }
  refresh();
  return {};
}

/** Pauses, resumes or archives an automation. */
export async function changeAutomationStatusAction(
  ref: ProjectRef & {
    automationId: string;
    change: "pause" | "resume" | "archive";
  },
): Promise<{ error?: string }> {
  const session = await requireOrganization(
    ref.organizationId,
    `${automationsPath(ref)}/${ref.automationId}`,
  );
  try {
    await changeAutomationStatus(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.automationId,
      ref.change,
    );
  } catch (error) {
    return { error: kairosMessageOf(error) };
  }
  refresh();
  return {};
}
