# Notifications (Kerykes)

How Aether-os tells people that something needs them or happened: a draft waiting for approval, a failed task, a paused task tree, a budget running out. **Kerykes** owns this; the *kērykes* were the heralds of ancient Greece, who carried announcements.

Status: agreed design; built in its first form (`../kerykes/CLAUDE.md`): the notifications in the table below except watchers, each user's inbox (in Iris: the Inbox item of the sidebar with the unread count, and the inbox page; refreshed on each page load, no live updates yet), and email over SMTP (Mailpit locally) with retries. Not built yet: preferences, digests, rate limits, watchers, Slack and Teams, bounce handling, and inbox retention. Sections marked **Proposal** are not agreed yet.

What the first form decided where this document left room:

- **Failures and successes are told once per task tree,** for its top-level task (a failed subtask fails its parents too), to its requester. A task a service requested (Kairos's) has no user to tell yet; the automation's watchers will be.
- **Paused work** goes to the organization's owners and admins (a project's admins are them), once per task tree, budget and day; **budget warnings** to them too, once per budget and window, linking to where that budget is set.
- **No task titles in notifications:** a title can come from an issue (untrusted), so notifications say "a task in <project>" and link to it; the project's name is the only text they take from elsewhere.
- **Recipients' permissions are checked twice,** when the notification is made and again before its email goes out, against Kerykes's copy of Polis's memberships. That copy is read from Polis the first time an organization comes up, then kept from Polis's events (version-guarded); the inbox shows only the organization and the projects the reader's token can read.
- **Email addresses come from Pistis** (`GET /v1/users/{userId}`, which platform services can now read with `platform:read`).

## Decisions

| Decision | Choice |
|---|---|
| Owner | **Kerykes**, a separate service. It consumes events, decides who is told, applies preferences, and delivers. |
| Channels | **In-app** (Iris), **email**, and **Slack / Teams**; the chat channels are delivered **through Proxenos**, which owns those connections. |
| Recipients | **Resolved from roles and relationships** (approvers, requester, watchers), never from a fixed list in the event. |
| Email | **Resend or SES** in production, behind an `EmailSender` port; **Mailpit** locally (`docker-compose.yml`), which catches everything. |
| Acting from chat | **Yes: reviews can be answered from Slack and Teams**, by users whose chat account is linked to their Aether-os user in Pistis. |

## Responsibilities

| Kerykes does | Kerykes does not |
|---|---|
| Consume the events that matter to people | Decide what happened; it only reacts to other services' events |
| Resolve recipients from Polis memberships and the task's relationships | Hold connections or tokens for Slack or Teams (Proxenos does) |
| Apply each user's preferences (channel, immediate / digest / off) | Approve, cancel or change anything itself; chat actions go from Proxenos to Hephaestus as the user (see Acting from Slack or Teams) |
| Keep each user's in-app inbox (read / unread) | Store artifact content, prompts or anything else from the task |
| Deliver email, and Slack / Teams messages via Proxenos, with retries | |

## Notifications

| Event | Notification | Default recipients | Default channels |
|---|---|---|---|
| `task.awaiting-review` | Drafts waiting for review | The project's approvers (below) | In-app, email |
| `task.failed` | A task failed | The requester; the automation's watchers | In-app, email |
| `task.succeeded` | A task finished | The requester (for tasks started by hand) | In-app |
| `task.paused` | Work paused, budget ran out | Project admins (task tree or project budget), organization admins (organization budget) | In-app, email |
| `budget.threshold-reached` | Budget nearly used | Admins of the budget's scope | In-app, email |
| `membership.granted` | You were added to an organization or project | That user | In-app, email |

Further types are added by adding a row: an event, a rule for recipients, default channels.

## Recipients

- **Approvers** of a project are the users with an explicit `approver` grant on it. Organization `owner`s and `admin`s can also approve everywhere, but are only notified if they **opt in** per project, or if the project has no explicit approvers; otherwise every review in the organization would reach every admin.
- **The requester** is the user recorded on a task started by hand (tasks always run as a service account; the requesting user is recorded, see `identity.md`). For a subtask, the requester of its top-level task.
- **Watchers**: users can watch a task tree, an automation or a project, and get its notifications too.
- **Only users.** Service accounts and services are never recipients.
- **Checked at send time.** Kerykes re-checks that each recipient still holds `task:read` (or the permission the notification is about) when it sends, not when the recipient was first resolved, so a revoked member is not told about work they no longer may see. It keeps a local copy of memberships, updated from Polis's `membership.*` events.

## Preferences (Proposal)

- Per user, per organization, per notification type, optionally overridden per project: which channels, and `immediate`, `digest` (daily) or `off`.
- **In-app is always on.** Users can mute email and chat, but the inbox in Iris always shows everything that concerns them.
- Organization admins can set organization defaults (e.g. "reviews go to the `#aether-reviews` Slack channel") that users' own preferences refine.
- Every email has a one-click link to change that preference.

## Content

- **Thin, linking to Iris:** what happened, which task, project and organization, and a link. No artifact content, no prompts, no diff.
- **No untrusted text.** Issue titles, comments and agent output are written by people outside the organization, or by an agent; they could be phishing ("Click here to approve"). Notifications show Aether-os's own titles, and Iris shows the rest after sign-in. Proposal: if a task title came from untrusted input, it is shortened, escaped, and never linkified.
- **Links go to Iris only.** A link never approves or changes anything by being opened. Approving happens in Iris, or with an explicit button press in Slack or Teams by a linked user (below); never from an email.

## Acting from Slack or Teams

A review message in Slack or Teams has buttons: **Approve**, **Request changes**, **Reject**, and **Open in Iris**. Approval rules don't change: only a user holding `task:approve` in the project can answer, never a service account (see `identity.md`).

Linking chat accounts to Aether-os users is done in **Pistis**, like every external identity: by provider and external subject (Slack workspace + user ID, Microsoft tenant + user ID), never by email address.

Flow:

1. Kerykes sends the review message through Proxenos. Each button carries an opaque reference to the review (notification ID, task tree, review round), which Hephaestus checks again; it grants nothing by itself.
2. The user presses a button. Slack or Teams sends the interaction to **Proxenos**, which verifies it (Slack's request signature and timestamp; Teams's Bot Framework token) and deduplicates it.
3. Proxenos asks Pistis which Aether-os user the chat account is linked to. Not linked: the user gets a private reply with a link to link their account, and nothing happens.
4. Proxenos obtains a **chat action token** from Pistis by token exchange: `sub` = the linked user, `act` = Proxenos, valid for a minute, for this one action. Pistis's exchange rules allow only Proxenos to obtain these, and only for linked users.
5. Proxenos calls Hephaestus's normal review endpoint with that token. Hephaestus checks permissions as for any request (`task:approve`, `sub_type` is `user`) and that the drafts are still pending in that round; a stale button ("already reviewed", "a newer revision exists") changes nothing.
6. The message is updated for everyone who sees it: "Approved by Jane Doe", or the error.

Rules:

- **Request changes** opens a dialog (Slack modal, Teams task module) for the comments; they're stored as review comments like those written in Iris.
- **Anyone in a channel sees the buttons**, but only linked users with `task:approve` in that project succeed; everyone else gets a private "you can't approve this" reply.
- **The message shows what the reviewer needs to decide:** the task, the drafts (kinds and titles), the verification checklist (passed / failed / manual) and cost, all Aether-os's own data. No untrusted text, no diffs; "Open in Iris" for the details. `manual` criteria are confirmed by approving, as in Iris.
- **Can be restricted.** A project setting `allowChatApproval` (Proposal: on by default), and Themis policy can require approval in Iris for specific artifacts (e.g. pull requests against `main`), where the chat message offers only "Open in Iris".
- **Audit:** the approval records the user and `act` = Proxenos with the channel, so "approved from Slack" stays visible.

## Delivery

- **Idempotent:** Kerykes deduplicates on `eventId`, so a redelivered event never sends twice.
- **Grouped:** one notification per review round of a task tree (pending drafts are reviewed together, see `tasks.md`), not one per draft; repeated failures of the same task within a short window are collapsed.
- **Rate-limited** per recipient, with the excess going to the digest.
- **Retried** with backoff per channel; delivery status (sent, failed, bounced) is recorded per notification, and repeated email bounces disable email for that address until it's confirmed again.
- **Email** goes through an `EmailSender` port, with adapters for Resend and SES in production and SMTP for Mailpit locally (`localhost:1025`, UI on `localhost:8025`). Sending domains are verified (SPF, DKIM, DMARC) at the provider.
- **Email addresses** come from Pistis (the user's verified email). Kerykes doesn't let users enter another address.
- Kerykes is per organization like everything else: a user in two organizations has two inboxes, matching their one-organization-per-token sessions.

## In-app (Iris)

- Kerykes stores each user's inbox: notification, link, read / unread, created at.
- Iris reads it through the Kerykes API (unread count, list, mark as read) and gets new notifications live (Proposal: server-sent events).
- Inbox entries expire after a retention period (Proposal: 90 days).

## Open questions

None at the moment.
