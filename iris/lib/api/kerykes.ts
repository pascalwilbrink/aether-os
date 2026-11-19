import "server-only";

import { config } from "../config";
import type { components } from "./generated/kerykes-api";
import { call, type Page } from "./http";

/** Kerykes types, generated from ../contracts/kerykes.openapi.yaml. */
export type KerykesSchemas = components["schemas"];
export type Notification = KerykesSchemas["NotificationResponse"];

const kerykes = <T>(path: string, token: string, init?: Parameters<typeof call>[3]) =>
  call<T>(config.kerykesUrl, path, token, init);

const inboxOf = (organizationId: string) => `/v1/organizations/${organizationId}/notifications`;

// --- The signed-in user's own inbox in the organization (`org:read`) ---

/** Newest first; `unread` filters, `cursor` continues. */
export const listNotifications = (
  token: string,
  organizationId: string,
  options: { unread?: boolean; cursor?: string; limit?: number } = {},
) => {
  const query = new URLSearchParams({ limit: String(options.limit ?? 30) });
  if (options.unread !== undefined) query.set("unread", String(options.unread));
  if (options.cursor) query.set("cursor", options.cursor);
  return kerykes<Page<Notification>>(`${inboxOf(organizationId)}?${query}`, token);
};

export const countUnread = (token: string, organizationId: string) =>
  kerykes<KerykesSchemas["UnreadCount"]>(`${inboxOf(organizationId)}/unread-count`, token);

/** Marks it read (`true`) or unread again (`false`). */
export const markNotification = (token: string, organizationId: string, notificationId: string, read: boolean) =>
  kerykes<Notification>(`${inboxOf(organizationId)}/${notificationId}/${read ? "read" : "unread"}`, token, {
    method: "POST",
  });

export const readAllNotifications = (token: string, organizationId: string) =>
  kerykes<KerykesSchemas["ReadAllResponse"]>(`${inboxOf(organizationId)}/read-all`, token, { method: "POST" });
