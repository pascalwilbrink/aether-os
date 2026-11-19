import Link from "next/link";

import { countUnread } from "@/lib/api/kerykes";
import { currentSession } from "@/lib/auth/current";
import { unreadBadge } from "@/lib/notifications";

/**
 * The link to the inbox, with the unread count, for someone signed in to
 * this organization. Without a session for it, or with Kerykes down, the
 * count is left out; the link stays.
 */
export async function InboxLink({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const session = await currentSession();
  if (session?.organizationId !== organizationId) {
    return null;
  }
  let badge: string | null = null;
  try {
    badge = unreadBadge((await countUnread(session.accessToken, organizationId)).unread);
  } catch {
    badge = null;
  }
  return (
    <Link href={`/orgs/${organizationId}/notifications`} className="text-sm underline">
      Inbox
      {badge ? (
        <span
          className="ml-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-xs text-white no-underline"
          aria-label={`${badge} unread`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
