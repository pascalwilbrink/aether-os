import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/app/components/action-forms";
import { secondaryButtonClass } from "@/app/components/form";
import { listNotifications, type Notification } from "@/lib/api/kerykes";
import { requireOrganization } from "@/lib/auth/current";
import { inboxFilter, NOTIFICATION_TYPE_LABELS } from "@/lib/notifications";
import { formatTime } from "@/lib/tasks";

import { markNotificationAction, openNotificationAction, readAllAction } from "./actions";

type Props = PageProps<"/orgs/[organizationId]/notifications">;

/** The signed-in person's inbox in this organization (Kerykes): what needs them, newest first. */
export default function NotificationsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Inbox {...props} />
    </Suspense>
  );
}

async function Inbox({ params, searchParams }: Props) {
  const { organizationId } = await params;
  const { show, cursor } = await searchParams;
  const path = `/orgs/${organizationId}/notifications`;
  const session = await requireOrganization(organizationId, path);
  const filter = inboxFilter(show);

  let page: { items: Notification[]; nextCursor: string | null } | null = null;
  try {
    page = await listNotifications(session.accessToken, organizationId, {
      unread: filter === "unread" ? true : undefined,
      cursor: typeof cursor === "string" ? cursor : undefined,
    });
  } catch (error) {
    // Signing out after a 401 goes through; Kerykes being down doesn't.
    unstable_rethrow(error);
    page = null;
  }

  const tab = (value: "unread" | "all", label: string) =>
    filter === value ? (
      <span className="font-medium">{label}</span>
    ) : (
      <Link href={value === "all" ? `${path}?show=all` : path} className="underline">
        {label}
      </Link>
    );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm">
          <Link href={`/orgs/${organizationId}`} className="underline">
            ← Organization
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          What needs you in this organization: drafts to review, tasks of yours that failed or finished, paused work and
          budgets. Important ones are emailed too.
        </p>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="space-x-3">
          {tab("unread", "Unread")}
          {tab("all", "All")}
        </p>
        {page && filter === "unread" && page.items.length > 0 ? (
          <ActionButton
            action={readAllAction.bind(null, organizationId)}
            label="Mark all as read"
            pendingLabel="Marking…"
          />
        ) : null}
      </div>

      {page === null ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Notifications are unavailable right now.</p>
      ) : page.items.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {filter === "unread" ? "Nothing unread." : "Nothing yet."}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {page.items.map((notification) => (
            <li key={notification.id} className="flex items-start justify-between gap-4 py-3">
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="mr-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                    {NOTIFICATION_TYPE_LABELS[notification.type]}
                  </span>
                  <span className={notification.readAt ? "" : "font-medium"}>{notification.title}</span>
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{notification.body}</p>
                <p className="text-xs text-zinc-500">{formatTime(notification.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form action={openNotificationAction.bind(null, organizationId, notification.id)}>
                  <button type="submit" className={secondaryButtonClass}>
                    Open
                  </button>
                </form>
                <ActionButton
                  action={markNotificationAction.bind(null, {
                    organizationId,
                    notificationId: notification.id,
                    read: !notification.readAt,
                  })}
                  label={notification.readAt ? "Mark unread" : "Mark read"}
                  pendingLabel="…"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {page?.nextCursor ? (
        <p className="text-sm">
          <Link
            href={`${path}?${new URLSearchParams({
              ...(filter === "all" ? { show: "all" } : {}),
              cursor: page.nextCursor,
            })}`}
            className="underline"
          >
            Older
          </Link>
        </p>
      ) : null}
    </div>
  );
}
