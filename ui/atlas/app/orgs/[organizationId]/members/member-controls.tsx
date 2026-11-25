import { assignableRoles, highestRole, roleLabel, type Member } from "@/lib/members";

import { ActionButton } from "../../../components/action-button";
import { RoleForm } from "../../../components/role-forms";
import { changeRoleAction, removeAccessAction } from "./actions";

/**
 * A member's role, and taking their access away, where the signed-in person
 * may: not their own (they'd lock themselves out), and an owner's only as
 * an owner. Otherwise the role, and why.
 */
export function MemberControls({
  organizationId,
  member,
  me,
}: {
  organizationId: string;
  member: Member;
  me: { sub: string; roles: string[] };
}) {
  const role = highestRole(member.roles);
  const self = member.userId === me.sub;
  const ownerOnly = member.roles.includes("owner") && !me.roles.includes("owner");
  if (self || ownerOnly) {
    return (
      <span className="text-sm">
        {roleLabel(role)}{" "}
        <span className="text-zinc-500">
          {self ? "(you)" : "(only owners change owners)"}
        </span>
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-2">
      <RoleForm
        action={changeRoleAction.bind(null, organizationId, member.membershipId)}
        roles={assignableRoles(me.roles)}
        current={role}
        label={`${member.name}'s role`}
      />
      <ActionButton
        action={removeAccessAction.bind(null, organizationId, member.membershipId)}
        label="Remove access"
        pendingLabel="Removing…"
        confirm={`Take ${member.name}'s access away? They lose every role in the organization's projects too.`}
        danger
      />
    </div>
  );
}
