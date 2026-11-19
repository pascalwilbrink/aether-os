import type { components } from "./api/generated/kerykes-api";

type Notification = components["schemas"]["NotificationResponse"];
type NotificationType = components["schemas"]["NotificationType"];

/** What each kind is about, in a word or two (the inbox's label). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  review_requested: "Review",
  task_failed: "Failed",
  task_succeeded: "Finished",
  task_paused: "Paused",
  budget_threshold: "Budget",
  membership_granted: "Access",
};

const SAFE_PATH = /^\/orgs\/[0-9a-f-]{36}(\/[A-Za-z0-9-]+)*(#[a-z-]+)?$/;

/**
 * Where opening a notification goes: its link when it's a page of this
 * organization in Iris, else the organization's home. Never anywhere else,
 * so a stored link can't send anyone off-site.
 */
export function notificationHref(notification: Pick<Notification, "link">, organizationId: string): string {
  const { link } = notification;
  return SAFE_PATH.test(link) &&
    (link === `/orgs/${organizationId}` ||
      link.startsWith(`/orgs/${organizationId}/`) ||
      link.startsWith(`/orgs/${organizationId}#`))
    ? link
    : `/orgs/${organizationId}`;
}

/** The count on the inbox link: none at zero, `99+` past 99. */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/** The inbox's filter from `?show=`: only unread ones unless `all`. */
export function inboxFilter(show: string | string[] | undefined): "unread" | "all" {
  return show === "all" ? "all" : "unread";
}
