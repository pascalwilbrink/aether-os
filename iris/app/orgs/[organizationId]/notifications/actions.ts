"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/app/components/action-forms";
import { markNotification, readAllNotifications } from "@/lib/api/kerykes";
import { ApiError } from "@/lib/api/http";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { notificationHref } from "@/lib/notifications";

const inbox = (organizationId: string) => `/orgs/${organizationId}/notifications`;

/** A message for a failed call; Kerykes unreachable is said as such. */
const problem = (error: unknown) =>
  error instanceof ApiError ? messageOf(error) : "Notifications are unavailable right now. Try again later.";

/**
 * Opens a notification: marks it read, then goes where it points. The
 * destination is the notification's own link as Kerykes returns it (not
 * anything the form sent), and only ever a page of this organization.
 */
export async function openNotificationAction(organizationId: string, notificationId: string): Promise<void> {
  const session = await requireOrganization(organizationId, inbox(organizationId));
  let href = inbox(organizationId);
  try {
    const notification = await markNotification(session.accessToken, organizationId, notificationId, true);
    href = notificationHref(notification, organizationId);
  } catch {
    // Gone, or Kerykes is down: back to the inbox.
  }
  redirect(href);
}

/** Marks one read or unread again. */
export async function markNotificationAction(ref: {
  organizationId: string;
  notificationId: string;
  read: boolean;
}): Promise<ActionState> {
  const { organizationId, notificationId, read } = ref;
  const session = await requireOrganization(organizationId, inbox(organizationId));
  try {
    await markNotification(session.accessToken, organizationId, notificationId, read);
  } catch (error) {
    return { error: problem(error) };
  }
  refresh();
  return {};
}

export async function readAllAction(organizationId: string): Promise<ActionState> {
  const session = await requireOrganization(organizationId, inbox(organizationId));
  try {
    await readAllNotifications(session.accessToken, organizationId);
  } catch (error) {
    return { error: problem(error) };
  }
  refresh();
  return {};
}
