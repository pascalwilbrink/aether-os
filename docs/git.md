# Git provider integration

How Aether-os gets access to repositories, receives their events, and turns an agent's work into branches and pull requests.

Status: agreed design, being built. Proxenos (`../proxenos`) connects the GitHub App (signed single-use state, then the installing person's own GitHub authorization checked against the installation), keeps installations and their repositories in step with GitHub (verified, deduplicated installation webhooks, and a sync), links repositories to projects, and mints installation tokens narrowed to one linked repository for task tokens. Hephaestus puts a task's repository in its sandbox, takes the agent's commits back out, pushes them to the task tree's branch (rebasing, never forcing) and records them as a `pull_request` artifact, opens (or adopts and updates) the pull request at delivery, follows its state from GitHub's `pull_request` webhooks (Proxenos's `git.pull-request.updated`), and deletes the tree's branch when it fails, is cancelled, or its pull request is merged or closed (below), committing as the app's bot. Iris connects GitHub (an organization's GitHub page), links repositories to projects, and lets a task choose one of its project's repositories. Proxenos publishes issues and their comments (`github.issue.opened`, `.labeled`, `github.issue-comment.created`) with the author's role on the repository and `fromAetherOs`, keeping the full payload for `GET …/webhook-deliveries/{id}` (not pruned yet: the 7 days are a Proposal). A rebase conflict goes back to the agent in the same execution (below). Kairos consumes the issue events and fires automations (`automations.md`); issue events carry the repository's `links` (project and link ID) so a task can work in it. Sections marked **Proposal** are not agreed yet.

## Decisions

| Decision | Choice |
|---|---|
| Providers | **GitHub first**, behind a `GitProvider` port so GitLab and Bitbucket can follow. |
| Authentication | **A GitHub App**, installed per organization on the repositories it may use. No personal access tokens, no long-lived tokens. |
| Who owns connections | **Proxenos**, a separate integrations service: installations, repository ↔ project links, provider credentials and the webhook endpoints, for GitHub now and Slack, Jira and others later. Kairos consumes its events for triggers; Hephaestus asks it for repository access per task. |
| Credentials in the sandbox | **The sandbox never holds a token that can push.** It reads through the egress proxy; Hephaestus pushes. |
| Branches | **One branch per task tree**, `aether/<top-level task ID>`, shared by every subtask in the tree, including parallel ones. Never the default branch. |
| Triggers from untrusted people | **Off by default.** Automations only fire for events from repository collaborators unless configured otherwise. |

## Connecting a repository

1. An organization admin (`org:manage`) starts "Connect GitHub" in Iris. Proxenos redirects to the GitHub App's installation page with a **signed, single-use `state`** that names the organization.
2. On the setup callback, Proxenos checks the `state`, and checks with GitHub (using the installing user's OAuth token) that this user can really administer the installation. Without that check, anyone could attach someone else's installation ID to their organization.
3. Proxenos records the **installation** for the organization: installation ID, account (GitHub organization or user), and the repositories it covers.
4. A project admin links one or more of those repositories to a project (`project:manage`). A project with a linked repository is "repository-backed" in the sense of `tasks.md` (documents live in the repository).

- One installation belongs to exactly one Aether-os organization.
- Installation changes (repositories added or removed, app suspended or uninstalled) arrive as webhooks; Proxenos updates the links and publishes `git.installation-changed`, so Hephaestus stops starting tasks against repositories it lost.
- GitHub Enterprise Server: a separate GitHub App per server, registered by the organization; same model.

## Credentials

- The GitHub App's private key is a **platform secret** in OpenBao. Only Proxenos can read it: it is the one component that mints installation tokens.
- For each task execution, Hephaestus asks Proxenos (with the task token) for an **installation token restricted to the task's repository** and to the permissions that task needs (GitHub supports narrowing both per token). Tokens live one hour at most and are never stored.
- The app requests few permissions: contents (read/write), pull requests (read/write), issues (read/write), metadata (read), checks (read). **Not `workflows`**, so nothing Aether-os pushes can change `.github/workflows` (GitHub refuses such pushes), which closes the path of an agent giving itself CI secrets.

## Inside the sandbox

| Operation | How |
|---|---|
| Clone, fetch | Through the sandbox's egress proxy. The proxy adds a **read-only** credential for the task's repository only; the sandbox never sees a token. **Built so far, until the proxy exists:** Hephaestus clones with a read token on its own side and moves the repository into the sandbox as a git bundle, so the sandbox has no network at all. |
| Commit | The agent commits locally in the sandbox. Author: the Aether-os app's bot identity; every commit gets an `Aether-Task: <task ID>` trailer (and `Co-authored-by:` the requesting user, when there is one). |
| Push | **Hephaestus**, not the sandbox: at the end of a run it takes the new commits out of the sandbox (a `git bundle`; built) and pushes them to the task tree's branch with its own token. It refuses to push anything but `aether/*` branches, and refuses force-pushes to branches it didn't create. |
| Pull request, comments | Hephaestus calls the provider API at **delivery**, never the agent directly. |

Because pushes happen outside the sandbox, a compromised or misbehaving agent can at worst produce bad commits on its own branch, which still go through verification and review.

Recommended for users, shown in Iris when connecting a repository: branch protection on the default branch, so even a mistake in Aether-os can't push to it.

## Branches and pull requests

- **One branch per task tree:** `aether/<top-level task ID>`, shared by the whole tree. Subtasks, and the subtrees under them, all work on that branch, in parallel where `dependsOn` allows.
- **Each execution starts from the branch head** at the moment it's provisioned (or from the commit an input pins), so it sees the work of every dependency that finished before it.
- **Pushes are serialized per branch.** Hephaestus pushes one execution's commits at a time: it rebases them onto the current head, then pushes (never a force-push). Parallel subtasks therefore land one after another, as a linear history.
- **A rebase conflict goes back to the agent.** The task resumes in its sandbox at the new head, with the conflict to resolve, and is verified again before its commits are pushed. This counts as a round, so a task that keeps conflicting eventually fails like any other. **Built:** in the same execution and sandbox, the branch's new commits go in as a bundle and the agent's commits are rebased onto them there; the rebase stops at the conflicts, the agent resolves them and finishes the rebase (an unfinished rebase fails it `agent_failed`), and the task goes back to `running` (`reason: branch-conflict`). It shares the execution's `VERIFICATION_MAX_ROUNDS`; once they're used up, the execution fails as a retryable infrastructure failure and the next one starts from the branch's head.
- Planning tasks should split work so parallel subtasks touch different files; the planning task's verification can check that (Proposal: a warning when parallel plan entries are expected to touch the same paths).
- A `pull_request` **draft** artifact is the pushed branch plus the prepared title and description, at a specific head commit. A revision (after request changes or failed checks) adds commits and becomes a new draft at the new head.
- **Delivery** opens the PR (or updates it, if a previous round already opened one). It's idempotent: an existing PR for the branch is adopted, not duplicated.
- PR state follows GitHub: Proxenos receives `pull_request` webhooks and publishes `git.pull-request.updated`; Hephaestus updates the artifact's `state` (`open` → `merged` / `closed`).
- **Branch cleanup:** the branch is deleted when its task tree fails or is cancelled, and when the PR is merged or closed, unless the repository keeps merged branches.

## Webhooks

- One public endpoint per provider in Proxenos (`POST /v1/webhooks/github`).
- Every delivery is verified (`X-Hub-Signature-256` with the app's webhook secret) before anything else; unverified requests are dropped.
- **Deduplicated** on `X-GitHub-Delivery`, because GitHub redelivers.
- Proxenos maps the installation to the organization and the repository to its projects, stores the payload briefly (for debugging and for automations that need the full payload; Proposal: 7 days), and publishes a normalized event (e.g. `github.issue.opened`) with the organization, projects, the author and the author's repository permission.
- **Kairos** consumes those events and matches them against automations. It never talks to GitHub's webhooks directly.
- Acknowledge fast (GitHub expects a response within 10 seconds): verify, store, return 202, and process asynchronously.
- **No loops:** events caused by the Aether-os app itself (its bot is the sender) are marked as such (`fromAetherOs: true`) and never trigger automations unless an automation explicitly opts in. Otherwise an agent's own comment could trigger the agent again.

## Untrusted input

Issue titles and bodies, comments, PR descriptions and repository files are written by people who may not be the organization's members. They are **data, not instructions**:

- Automations fire only for events whose author is a collaborator with at least write access to the repository, by default. An automation can widen that (e.g. "anyone, if the issue has the label `aether`", where only maintainers can add labels).
- Untrusted content reaches the agent marked as such, and APS policies apply to everything the agent does with it (tool calls, network, outputs).
- Public repositories need the strictest defaults: anyone can open an issue.

## Open questions

None at the moment.
