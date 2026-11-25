import { loadAccess } from "@/lib/access";
import type { Person } from "@/lib/api/polis";
import type { Session } from "@/lib/auth/session";
import { assignableRoles } from "@/lib/members";

import { GrantForm } from "../../../../components/role-forms";
import { Card } from "../../../../components/ui";
import { grantAccessAction } from "../../members/actions";
import { MemberControls } from "../../members/member-controls";

/**
 * Whether someone may use the organization: their role (changed or taken
 * away here), access to give once they've signed up, or why not yet.
 */
export async function PersonAccess({
  session,
  organizationId,
  person,
}: {
  session: Session;
  organizationId: string;
  person: Person;
}) {
  if (!person.userId) {
    return (
      <p className="text-sm text-zinc-500">
        They can be given access once they sign up with {person.email}.
      </p>
    );
  }
  const { members, me } = await loadAccess(session, organizationId);
  const member = members.find((m) => m.userId === person.userId);
  return (
    <Card>
      {member ? (
        <MemberControls organizationId={organizationId} member={member} me={me} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            They&apos;ve signed up, but can&apos;t use the organization yet.
          </p>
          <GrantForm
            action={grantAccessAction.bind(null, organizationId)}
            subject={person.userId}
            roles={assignableRoles(me.roles)}
            defaultRole="member"
            submitLabel="Give access"
          />
        </div>
      )}
    </Card>
  );
}
