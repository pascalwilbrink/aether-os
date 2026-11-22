# Identity and permissions

How Aether-os decides **who** is acting and **what** they may do. Pistis (authentication), Polis (memberships and roles), Krepis (enforcement in every service) and OpenBao (secret access) implement this together.

Status: agreed design, being built. Pistis (`../pistis`) has users and their linked identities (`user_providers`: `(provider, subject)` → user, never by email), its own `password` provider, sign-in through any configured external OpenID Connect provider (`PISTIS_UPSTREAM_PROVIDERS`), user tokens (authorization code with PKCE; an organization is chosen with the resource indicator `urn:aether-os:org:<id>`, and `org_roles` come from Polis at every issue and refresh), and platform service tokens (client credentials). Krepis enforces authentication, tenancy and permissions (`AuthModule`, below), and Polis, Hephaestus and Pistis's own API require tokens. Polis has project memberships, and Pistis puts them in tokens as `project_roles`. Pistis has service accounts with API keys, and token exchange for them: an API key for a service account token, and task tokens for Hephaestus (`project_id`, `task_id`, `act`). Not yet: Kairos's delegation, chat action tokens (Proxenos), and reacting to Polis's revocation events.

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
  "org_roles": ["owner" | "admin" | "member" | "viewer"],  // one or more
  "project_roles": { "<project id>": "approver" | "editor" | "viewer" },  // explicit grants only
  "act": { "sub": "<actor>", "sub_type": "service" },  // present when acting on behalf of someone (RFC 8693)
  "task_id": "<task id>",                 // task tokens only
  "project_id": "<project id>",           // task tokens only: the one project the token is limited to
  "task_tree_id": "<top-level task id>",  // task tokens, when Hephaestus sends it (pylon.md): the tree's budget
  "agent_id": "<agent id>", "agent_version_id": "<agent version id>",  // task tokens, likewise: the agent's budget and keys
  "jti": "<token id>", "iat": 0, "exp": 0
}
```

- `project_roles` carries only explicit project grants, which are never `admin`. Organization `owner`s and `admin`s are project `admin` everywhere, which Krepis derives from `org_roles`, so their tokens need no project list.
- **Delegation** uses OAuth 2.0 token exchange (RFC 8693). When Kairos fires an automation, it exchanges its own service token for one with `sub` = the automation's service account and `act` = Kairos. Audit logs record both.
- **Task tokens:** when a task starts, Hephaestus exchanges for a token for the automation's service account, limited by `project_id` to the task's project, carrying `task_id`, and valid only for the task's lifetime. The task uses it for everything: OpenBao, Seshat, Loculus and other Aether-os APIs. Pistis's exchange rules decide which services may obtain tokens for which principals; for example, only Hephaestus may obtain task tokens.
- **Session tokens** (Proposal, `interaction.md`): for a copilot or voice session, Hephaestus exchanges for a token with `sub` = the person, `act` = Hephaestus and `session_id`, limited to the session's project and to read permissions, valid for minutes and renewed while the session is active. The agent sees what the person can see and changes nothing itself; side effects are frontend actions the person confirms with their own token, or tasks.
- **Chat action tokens:** when a linked user answers a review from Slack or Teams, Proxenos exchanges for a token with `sub` = that user and `act` = Proxenos, valid for about a minute and for that one action. Only Proxenos may obtain these, and only for users whose chat account is linked in Pistis (see `notifications.md`).

## Roles

Organization roles (stored on Polis memberships). A membership holds **one or more** of these fixed roles; a principal has the permissions of all its roles combined, and where a rule depends on "the organization role" (the project cap below), the highest one counts:

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

- **Polis enforces the cap** when a project role is granted, and when an organization role is lowered it lowers grants that now exceed it; when the organization membership is removed, its project grants go too. Polis also refuses `approver` for service accounts.
- **Krepis applies the cap again when evaluating** (effective project role = the lower of the grant and the cap, or `admin` for organization `owner`/`admin`), so a stale or inconsistent token can't escalate.

Consequence: everything that needs project `admin` (managing automations, project policies and secrets, project members) is done by organization admins. **Approving tasks is not tied to admin:** anyone with `task:approve` can approve, which project `admin`s and `approver`s have, so organization members can be made approvers per project.

## Permissions

Named `resource:action`. Organization-scoped permissions are checked against `org_roles` (granted if any of the roles has the permission); project-scoped permissions against the effective project role.

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
| `council:read` / `council:write` / `council:publish` (councils in Agora, `councils.md`) | org | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ | ✓ / ✓ / | ✓ / / |
| `org:task-template:manage` (organization-wide task templates) | org | ✓ | ✓ | | |
| `org:policy:write` (organization-wide policies) | org | ✓ | ✓ | | |
| `org:secret:write` (organization-wide secrets) | org | ✓ | ✓ | | |
| `org:knowledge:write` (organization-wide knowledge items, `knowledge.md`; Proposal) | org | ✓ | ✓ | | |

The organization-wide variants carry an `org:` prefix in code, so every permission name has exactly one scope.

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
| `workspace:manage` (create, acquire, release, suspend, resume, destroy) | project | ✓ | ✓ | ✓ | |
| `file:read` (a project's files in Loculus, and links to download them, `files.md`) | project | ✓ | ✓ | ✓ | ✓ |
| `file:write` (uploading and deleting them) | project | ✓ | ✓ | ✓ | |
| `repository:token` (a short-lived token for one of the project's linked repositories, from Proxenos; only with a task token, `../docs/git.md`) | project | ✓ | ✓ | ✓ | |
| `knowledge:read` (project knowledge in Seshat, `knowledge.md`) | project | ✓ | ✓ | ✓ | ✓ |
| `knowledge:write` (creating and editing items, uploading documents) | project | ✓ | ✓ | ✓ | |
| `knowledge:approve` (accepting or rejecting proposals; only people) | project | ✓ | ✓ | | |
| `model:invoke` (model calls and embeddings through Pylon, `pylon.md`; used by task tokens) | project | ✓ | ✓ | ✓ | |
| `session:use` (copilot, voice and council sessions, `interaction.md`, `councils.md`; Proposal) | project | ✓ | ✓ | ✓ | ✓ |
| `meeting:read` / `meeting:manage` (the meeting agent, `interaction.md`; Proposal) | project | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / |

Approval is gated only by `task:approve`: every principal holding it in the task's project can approve that task, with two rules:

- **Only people approve knowledge either:** `knowledge:approve` is dropped for tokens whose `sub_type` isn't `user`, so agents propose knowledge and never accept it.
- **Only people approve.** A service account never has `task:approve`, whatever its roles: Polis refuses to grant `approver` to a service account, and Krepis drops `task:approve` for any token whose `sub_type` isn't `user` (which also covers a service account with an organization `admin` role). An agent or automation can therefore never approve its own work.
- **Self-approval is allowed.** A user who requested a task may approve it themselves if they hold `task:approve`. The audit log records requester and approver, so self-approvals stay visible.

Notes:

- Agents are **organization-scoped** (shared across projects), matching the current agent API. Automations, tasks, workspaces, project policies and project secrets are project-scoped.
- There is **no `secret:read`** for people. Secrets are write-only through the API; only task tokens read them, from OpenBao, for their own project.
- Service accounts get roles exactly like users. An automation's service account is an organization `member` with project `editor` on its own project, and nothing else.
- Platform-level operations (e.g. suspending an organization) are not organization roles. They are **platform permissions**, held only by platform services (`sub_type: service`, no organization), as scopes Pistis grants per client (`platform_permissions` in `PISTIS_CLIENTS`):

  | Permission | For |
  |---|---|
  | `platform:read` | Reading any organization, project or membership (Pistis building token claims, Hephaestus resolving an organization it hasn't seen) |
  | `platform:manage` | Creating, suspending and activating organizations, and Pistis's user administration; for operator tooling until platform operators have their own principals |
  | `model:invoke` | Embeddings through Pylon charged to a project named in the path (Seshat, `pylon.md`) |

  An endpoint accepts them only where it says so (`@PlatformAccess`); everywhere else a platform service's own token is refused.
- **Creating an organization:** any user may, and becomes its first `owner` in the same transaction; a platform service needs `platform:manage` and the organization then has no owner until one is granted. Service accounts can't.
- **Owners are managed by owners:** granting `owner`, or changing or removing an owner's membership, needs the `owner` role (`member:manage` is not enough).

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

   Where the project is only known from the resource (a workspace's project), the route requires an organization token (`@RequirePermission('org:read')`) and the service checks the project permission with `AccessControl.assertProjectPermission`; lists are filtered with `AccessControl.readableProjects()`.

Every route declares its rule (`@Public`, `@Authenticated`, `@RequirePermission`, `@PlatformAccess`); a route without one is refused, so a forgotten decorator fails closed. The guard records the principal for the request, and events emitted while handling it carry it as `actor`.

The table being in Krepis means a role change is a Krepis release that every service picks up. Keep it the single definition: services must not keep their own role checks.

## Revocation

- Short token lifetimes bound how long a removed member keeps access.
- Polis publishes `membership.revoked`, `membership.role-changed` and `organization.suspended` on RabbitMQ. Pistis stops issuing tokens accordingly, and services reject the affected organization or principal immediately instead of waiting for expiry.

## Secrets (OpenBao)

OpenBao trusts Pistis through its JWT auth method. Its policies are templated on token claims, so a task token can read only `orgs/{org_id}/projects/{project_id}/*` (plus organization-wide secrets the organization grants to projects). People write secrets with their own token, which requires `secret:write`; tenant isolation is enforced by OpenBao itself, not by each service getting it right.

## Open questions

- Platform operators: for now operator tooling uses a platform service client with `platform:manage`; how people who operate the platform sign in (support access) and are audited is still open.
