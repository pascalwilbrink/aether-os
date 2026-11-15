# Identity and permissions

How Aether-os decides **who** is acting and **what** they may do. Pistis (authentication), Polis (memberships and roles), Krepis (enforcement in every service) and OpenBao (secret access) implement this together.

Status: agreed design, not built yet. Pistis will be built as part of Aether-os (in this monorepo); Krepis and Polis don't have the pieces described here yet.

## Decisions

| Decision | Choice |
|---|---|
| Identity provider | **Pistis** is an OIDC provider and federates external providers (Entra ID, Auth0, …). It is the **only** token issuer. |
| Token scope | **One organization per token.** Switching organization means asking Pistis for a new token. |
| Roles | **Organization level and project level** from day one. |
| Default project access | **None.** Organization members and viewers see a project only once granted a role in it. |
| Project role cap | **A project grant can't exceed the organization role.** Only organization owners and admins are project admins. |
| Task approval | **Anyone with `task:approve`** in the project can approve; project `admin`s and the project `approver` role have it. Only users, never service accounts; self-approval is allowed. |
| Permission checks | **Fixed role → permission table in Krepis**, behind an interface so OPA could take over later. |

## Principals

| `sub_type` | Example | Owned by | Authenticates with |
|---|---|---|---|
| `user` | A person | Pistis | Interactive OIDC sign-in, directly or via a federated provider |
| `service_account` | An automation's identity, a third-party integration | Pistis, belongs to one organization | API key or client credentials, exchanged for a short-lived token |
| `service` | Hephaestus, Kairos | Pistis, platform-level (no organization) | Client credentials |

Rules:

- **Users are identified by their Pistis `sub`.** External logins are linked to it by `(provider, external subject)`. Never link or match accounts by email address: anyone controlling an upstream account with your email would take over yours.
- **Tasks never run as a user.** Every Kairos automation gets its own service account when it's created, with only the roles it needs. A task started by hand in Iris also runs as a service account, with the requesting user recorded.
- **Platform services act on an organization only through token exchange**, never with their own token. Their own token is for platform-level calls (e.g. Pistis's exchange endpoint).

## Federation (external identity providers)

- An organization can configure its own upstream provider (e.g. its Entra tenant). Sign-ins for its email domain are routed there, but only after the domain is verified, so nobody can claim `acme.com` for their own provider.
- Provider group claims map to roles (e.g. Entra group "Aether Admins" → organization `admin`). The mapping lives in **Polis** with the memberships; Pistis forwards the groups at sign-in and Polis applies the mapping.
- Upstream tokens are only ever presented to Pistis. No other service accepts them.
- Later: SCIM provisioning into Polis, so people disabled upstream lose their memberships, not just their ability to sign in.

## Tokens

Short-lived JWTs (5–15 minutes) signed by Pistis with asymmetric keys. Services verify them locally against Pistis's JWKS endpoint; verification lives in Krepis.

```jsonc
{
  "iss": "https://pistis.<domain>",
  "aud": "aether-os",
  "sub": "<principal id>",
  "sub_type": "user" | "service_account" | "service",
  "org_id": "<organization id>",          // absent for platform `service` tokens
  "org_role": "owner" | "admin" | "member" | "viewer",
  "project_roles": { "<project id>": "approver" | "editor" | "viewer" },  // explicit grants only
  "act": { "sub": "<actor>", "sub_type": "service" },  // present when acting on behalf of someone (RFC 8693)
  "task_id": "<task id>",                 // task tokens only
  "project_id": "<project id>",           // task tokens only: the one project the token is limited to
  "jti": "<token id>", "iat": 0, "exp": 0
}
```

- `project_roles` carries only explicit project grants, which are never `admin`. Organization `owner`s and `admin`s are project `admin` everywhere, which Krepis derives from `org_role`, so their tokens need no project list.
- **Delegation** uses OAuth 2.0 token exchange (RFC 8693). When Kairos fires an automation, it exchanges its own service token for one with `sub` = the automation's service account and `act` = Kairos. Audit logs record both.
- **Task tokens:** when a task starts, Hephaestus exchanges for a token for the automation's service account, limited by `project_id` to the task's project, carrying `task_id`, and valid only for the task's lifetime. The task uses it for everything: OpenBao, Seshat, Loculus and other Aether-os APIs. Pistis's exchange rules decide which services may obtain tokens for which principals; for example, only Hephaestus may obtain task tokens.
- **Chat action tokens:** when a linked user answers a review from Slack or Teams, Proxenos exchanges for a token with `sub` = that user and `act` = Proxenos, valid for about a minute and for that one action. Only Proxenos may obtain these, and only for users whose chat account is linked in Pistis (see `notifications.md`).

## Roles

Organization roles (stored on Polis memberships):

| Role | Meaning |
|---|---|
| `owner` | Everything, including identity provider configuration and managing owners |
| `admin` | Manages the organization: members, projects, agents, organization-wide policies and secrets |
| `member` | Builds agents; works in the projects they're granted |
| `viewer` | Read-only |

Project roles (stored on Polis project memberships):

| Role | Meaning |
|---|---|
| `admin` | Manages the project: its members, automations, policies, secrets, task approvals. **Held only by organization `owner`s and `admin`s** (see below). |
| `approver` | Everything `editor` can do, plus approving tasks that wait for human approval |
| `editor` | Runs work: starts and cancels tasks, reads automations and workspaces |
| `viewer` | Read-only |

Rules:

- **No access by default.** Organization `member`s and `viewer`s see no projects until they're granted a project role.
- **Organization `owner`s and `admin`s are project `admin` in every project**, implicitly. That is the only way to be project `admin`: it can't be granted explicitly.
- **A project grant can never exceed the organization role.** The highest project role that can be granted is:

  | Organization role | Highest project grant |
  |---|---|
  | `owner`, `admin` | (implicitly `admin` everywhere; no grant needed) |
  | `member` | `approver` |
  | `viewer` | `viewer` |

- **Polis enforces the cap** when a project role is granted, and when an organization role is lowered it lowers or removes project grants that now exceed it.
- **Krepis applies the cap again when evaluating** (effective project role = the lower of the grant and the cap, or `admin` for organization `owner`/`admin`), so a stale or inconsistent token can't escalate.

Consequence: everything that needs project `admin` (managing automations, project policies and secrets, project members) is done by organization admins. **Approving tasks is not tied to admin:** anyone with `task:approve` can approve, which project `admin`s and `approver`s have, so organization members can be made approvers per project.

## Permissions

Named `resource:action`. Organization-scoped permissions are checked against `org_role`; project-scoped permissions against the effective project role.

| Permission | Scope | owner | admin | member | viewer |
|---|---|:-:|:-:|:-:|:-:|
| `org:read` | org | ✓ | ✓ | ✓ | ✓ |
| `org:manage` | org | ✓ | ✓ | | |
| `idp:manage` | org | ✓ | | | |
| `member:read` | org | ✓ | ✓ | ✓ | ✓ |
| `member:manage` | org | ✓ | ✓ | | |
| `service-account:manage` | org | ✓ | ✓ | | |
| `project:create` | org | ✓ | ✓ | ✓ | |
| `agent:read` | org | ✓ | ✓ | ✓ | ✓ |
| `agent:write` | org | ✓ | ✓ | ✓ | |
| `agent:publish` | org | ✓ | ✓ | | |
| `task-template:manage` (organization-wide) | org | ✓ | ✓ | | |
| `policy:write` (organization-wide) | org | ✓ | ✓ | | |
| `secret:write` (organization-wide) | org | ✓ | ✓ | | |

| Permission | Scope | project admin | approver | editor | viewer |
|---|---|:-:|:-:|:-:|:-:|
| `project:read` | project | ✓ | ✓ | ✓ | ✓ |
| `project:manage` | project | ✓ | | | |
| `project-member:manage` | project | ✓ | | | |
| `automation:read` | project | ✓ | ✓ | ✓ | ✓ |
| `automation:manage` | project | ✓ | | | |
| `policy:write` (project) | project | ✓ | | | |
| `secret:write` (project) | project | ✓ | | | |
| `task-template:manage` (project) | project | ✓ | | | |
| `task:read` | project | ✓ | ✓ | ✓ | ✓ |
| `task:create` | project | ✓ | ✓ | ✓ | |
| `task:cancel` | project | ✓ | ✓ | ✓ | |
| `task:approve` | project | ✓ | ✓ | | |
| `workspace:read` | project | ✓ | ✓ | ✓ | ✓ |

Approval is gated only by `task:approve`: every principal holding it in the task's project can approve that task, with two rules:

- **Only people approve.** A service account never has `task:approve`, whatever its roles: Polis refuses to grant `approver` to a service account, and Krepis drops `task:approve` for any token whose `sub_type` isn't `user` (which also covers a service account with an organization `admin` role). An agent or automation can therefore never approve its own work.
- **Self-approval is allowed.** A user who requested a task may approve it themselves if they hold `task:approve`. The audit log records requester and approver, so self-approvals stay visible.

Notes:

- Agents are **organization-scoped** (shared across projects), matching the current agent API. Automations, tasks, workspaces, project policies and project secrets are project-scoped.
- There is **no `secret:read`** for people. Secrets are write-only through the API; only task tokens read them, from OpenBao, for their own project.
- Service accounts get roles exactly like users. An automation's service account is an organization `member` with project `editor` on its own project, and nothing else.
- Platform-level operations (e.g. suspending an organization) are not organization roles; they belong to platform operators and are out of scope here.

## Enforcement

Every service, via Krepis:

1. **Authentication guard (global):** verify the JWT against Pistis's JWKS (`iss`, `aud`, signature, expiry) and attach the principal to the request.
2. **Tenancy guard (global):** the `:organizationId` in the route must equal the token's `org_id`; for task tokens, a `:projectId` in the route must equal `project_id`. A mismatch is a 404, not a 403, so other tenants' IDs aren't confirmed to exist.
3. **Permission check (per endpoint):**

   ```ts
   @RequirePermission('agent:publish')                         // organization-scoped
   @RequirePermission('task:approve', { project: 'projectId' }) // project from route param
   ```

   Backed by a `PermissionEvaluator` interface. The first implementation is the fixed table above, defined once in Krepis. An OPA-backed implementation (policies managed in Themis) can replace it later without touching endpoints.

The table being in Krepis means a role change is a Krepis release that every service picks up. Keep it the single definition: services must not keep their own role checks.

## Revocation

- Short token lifetimes bound how long a removed member keeps access.
- Polis publishes `membership.revoked`, `membership.role-changed` and `organization.suspended` on RabbitMQ. Pistis stops issuing tokens accordingly, and services reject the affected organization or principal immediately instead of waiting for expiry.

## Secrets (OpenBao)

OpenBao trusts Pistis through its JWT auth method. Its policies are templated on token claims, so a task token can read only `orgs/{org_id}/projects/{project_id}/*` (plus organization-wide secrets the organization grants to projects). People write secrets with their own token, which requires `secret:write`; tenant isolation is enforced by OpenBao itself, not by each service getting it right.

## Open questions

- Platform operators: how platform-wide administration (suspending organizations, support access) is authenticated and audited.
