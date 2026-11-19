# Events and commands

The messages Aether-os services exchange over RabbitMQ: the envelope, the conventions, and the catalogue of events and commands agreed so far.

Status: agreed conventions and envelope, documentation only. Sections marked **Proposal** are not agreed yet. This catalogue is the source until the AsyncAPI specs exist: when a service starts publishing, its part of the catalogue moves into `contracts/<service>.asyncapi.yaml` (see `../contracts/README.md`), types are generated from it, and this page links there.

## Conventions

| | Convention |
|---|---|
| Events | Facts that happened, in the past tense or as a state: `task.succeeded`, `membership.revoked`. Published to the producer's topic exchange `<service>.events`; the routing key is the event type. |
| Commands | Requests to a specific service: `task.create`. Sent to `<service>.commands`, a direct exchange owned by the receiver; routing key is the command name. The outcome comes back as events, never as a reply. |
| Queues | Each consumer owns a durable queue per purpose (`<consumer>.<producer>-events`, e.g. `hephaestus.polis-events`), bound to the routing keys it needs. |
| Delivery | At least once. Producers use the transactional outbox; consumers deduplicate on `eventId`. |
| In code | Services only emit and handle **local events**; Krepis's messaging module bridges them to and from RabbitMQ (see `engineering.md`, Events in code). |
| Ordering | Not guaranteed. Per aggregate, `aggregateVersion` increases; a consumer ignores an event older than the version it already applied. |
| Failures | A message that keeps failing is retried with backoff (delayed retry queues), then parked in the queue's dead-letter queue for inspection. It never blocks the queue. |
| Trace context | `traceparent` (and `tracestate`) in AMQP headers, copied on publish and restored on consume. |

## Envelope

Every event and command uses the Krepis `DomainEvent` shape. **`DomainEvent` in Krepis gets the new fields** (`schemaVersion`, `organizationId`, `projectId`, `actor`), so the domain event and the published message are the same thing, with no separate envelope at the outbox:

```jsonc
{
  "eventId": "<uuid>",              // deduplication key; for a command, also its idempotency key
  "eventType": "task.succeeded",
  "schemaVersion": 1,
  "aggregateId": "<task id>",
  "aggregateVersion": 7,
  "occurredAt": "2026-11-14T10:00:00Z",
  "organizationId": "<organization id>",  // absent only for platform-level events
  "projectId": "<project id>",            // when the aggregate is project-scoped
  "actor": { "sub": "<principal>", "sub_type": "user" | "service_account" | "service", "act": { "sub": "<on behalf of>" } },
  "payload": { }
}
```

Rules:

- **Thin, not secret.** Payloads carry IDs, states and the few fields consumers need to act without calling back. Never secrets, prompts, artifact content or personal data beyond IDs; consumers fetch details through the API with their own permissions.
- **Tenancy is in the envelope**, so consumers can route, filter and check tenancy without parsing the payload. A consumer must never act on a resource in an organization other than the one in the envelope.
- **Versioning:** within a `schemaVersion` only additive, optional changes. A breaking change is a new `schemaVersion`; the producer publishes both versions until every consumer has moved.

## Catalogue

### Polis (`polis.events`)

**Published** since Polis's outbox landed, and **consumed by Hephaestus** (`hephaestus.polis-events`: the organization and project events, for its copy of their status); the contract is `../contracts/polis.asyncapi.yaml`, which is the source for these events from now on (membership payloads also carry `membershipId`). Not built yet: `organization.deleted` and `project.deleted` (Polis has no deletes). Project memberships are published as their own events (below), not as `membership.*` with a project scope.

| Event | Payload | Consumers |
|---|---|---|
| `organization.created` | `organizationId`, `slug` | Pistis, Iris |
| `organization.suspended` / `organization.reactivated` | `organizationId`, `reason` | Every service (reject writes / resume) |
| `organization.deleted` | `organizationId` | Every service (delete tenant data) |
| `project.created` / `project.archived` / `project.deleted` | `projectId` | Hephaestus, Kairos, Themis, Seshat |
| `membership.granted` | `principal`, `scope` (organization or project), `roles` | Pistis, Iris, Kerykes |
| `membership.role-changed` | `principal`, `scope`, `from`, `to` (role lists) | Pistis, every service (drop cached permissions; Kerykes updates its recipient copy) |
| `membership.revoked` | `principal`, `scope` | Pistis, every service |
| `project-membership.granted` | `membershipId`, `principal`, `scope` (`project`: organization and project), `role` | Pistis, Iris, Kerykes |
| `project-membership.role-changed` | `membershipId`, `principal`, `scope`, `from`, `to` (one role each); also when a lowered organization role capped the grant | every service (drop cached permissions) |
| `project-membership.revoked` | `membershipId`, `principal`, `scope`; also when the organization membership went | every service |

### Agora (`agora.events`)

| Event | Payload | Consumers |
|---|---|---|
| `agent-version.published` | `agentId`, `agentVersionId`, `policySetVersionId` | Kairos, Kriterion |
| `agent-version.deprecated` | `agentId`, `agentVersionId` | Kairos (warn about automations still using it) |

### Themis (`themis.events`)

| Event | Payload | Consumers |
|---|---|---|
| `policy-set-version.published` | `policySetId`, `policySetVersionId`, `scope` | Agora, OPA bundle refresh |

### Proxenos (`proxenos.events`)

Proxenos, the integrations service (see `git.md`), turns verified provider webhooks into normalized events. Built so far (`../contracts/proxenos.asyncapi.yaml`): `git.installation-changed`, `git.repository-linked`, `git.repository-unlinked`, `git.pull-request.updated`, and `github.issue.opened`, `github.issue.labeled` and `github.issue-comment.created`.

| Event | Payload | Consumers |
|---|---|---|
| `github.issue.opened`, `github.issue.labeled`, `github.issue-comment.created` | `webhookDeliveryId` and `deliveryId`, `repositoryId`, `repository`, `projectIds` and `links` (project and link ID: a task's `repository.linkId`), the issue's `number`, `title`, `url`, `labels`, `isPullRequest`, the `label` added or `commentId`, `author` (who did it), `authorPermission` (their role on the repository, or null when GitHub couldn't say: untrusted), `fromAetherOs`. The full payload (body, comment) is fetched from Proxenos when needed (`GET …/webhook-deliveries/{webhookDeliveryId}`) | Kairos (triggers) |
| `git.installation-changed` | `installationId`, `provider`, `externalId`, `account`, `status`, `repositoriesAdded` / `repositoriesRemoved` (`repositoryId`, `fullName`) | Hephaestus, Kairos |
| `git.repository-linked` | `linkId`, `projectId`, `repositoryId`, `fullName` | Hephaestus, Iris |
| `git.repository-unlinked` | the same, and `reason` (`unlinked`, or `repository-removed` when the installation lost it) | Hephaestus, Iris |
| `git.pull-request.updated` | `repositoryId`, `repository`, `number`, `url`, `state` (`open`, `closed`, `merged`), `branch`, `baseBranch`, `headSha`, `mergedAt`, `fromAetherOs` | Hephaestus (artifact `state`, branch cleanup) |

### Kairos (`kairos.events`)

| Event | Payload | Consumers |
|---|---|---|
Published (`../contracts/kairos.asyncapi.yaml`): `automation.triggered`, with the run as its aggregate. Kairos consumes Proxenos's issue events and Hephaestus's `task.created` / `task.create-rejected` (`automations.md`).

| Event | Payload | Consumers |
|---|---|---|
| `automation.triggered` | `automationId`, `runId` (the command's idempotency key), `triggerType`, `sourceEventId`, `webhookDeliveryId` | Iris (activity), Kriterion |

Kairos sends `task.create` commands to Hephaestus when an automation fires (below).

### Hephaestus (`hephaestus.events`)

Published so far (`../contracts/hephaestus.asyncapi.yaml`): `task.created` (with `taskTemplateId` and `taskTemplateVersion`), `task.status-changed`, `task.succeeded` (with `primaryArtifactId` and `artifactIds`), `task.failed`, `task.cancelled`, `task.awaiting-review`, `task.verified`, `artifact.created` and `artifact.status-changed`, with the payloads in that spec (without costs, partial artifact IDs or automations, which don't exist yet). The rest come with the parts of the lifecycle that produce them. **Consumed by Kerykes** (`kerykes.hephaestus-events`): `task.awaiting-review`, `task.failed`, `task.succeeded`, `task.paused` and `budget.threshold-reached`; and Polis's `membership.*` and `project-membership.*` (`kerykes.polis-events`).

| Event | Payload | Consumers |
|---|---|---|
| `task.created` | `taskId`, `parentTaskId`, `topLevelTaskId`, `automationId`, `agentVersionId`, `taskTemplateVersion`, `idempotencyKey` | Kairos (correlate its command), Iris |
| `task.create-rejected` | `idempotencyKey`, `code`, `message` | Kairos |
| `task.status-changed` | `taskId`, `from`, `to`, `reason` | Iris |
| `task.awaiting-review` | `taskId`, `topLevelTaskId`, `requestedBy`, draft artifact IDs, `round` | Kerykes, Iris |
| `task.verified` | `taskId`, `executionId`, `round`, per-criterion `key` and `outcome` | Kriterion |
| `task.succeeded` | `taskId`, `requestedBy`, `primaryArtifactId`, `artifactIds`, `costUsd` | Kriterion, Kairos, Iris, Kerykes |
| `task.failed` | `taskId`, `topLevelTaskId`, `requestedBy`, `automationId`, `failureReason`, `partialArtifactIds` | Kriterion, Kairos, Iris, Kerykes |
| `task.cancelled` | `taskId`, `cancelledBy` | Kairos, Iris |
| `task.paused` / `task.resumed` | `taskId`, `topLevelTaskId`, the budget `scope` that ran out | Kerykes, Iris |
| `artifact.created` | `artifactId`, `taskId`, `kind`, `status`, `primary` | Iris, Kriterion |
| `artifact.status-changed` | `artifactId`, `from`, `to`, `revisionOf` | Iris, Kriterion |
| `artifact.deleted` | `artifactId` | Iris, Kriterion |
| `document.version-published` | document reference (`documentId`, `version`, `objectKey`, `sha256`) | Seshat (index), Iris |
| `document.deleted` | `documentId` | Seshat, Loculus cleanup |
| `budget.threshold-reached` | `budgetId`, `scope` (task tree / project / organization), `scopeId`, `limitUsd`, `spentUsd`, `windowStart` | Kerykes, Iris |

### Seshat (`seshat.events`)

| Event | Payload | Consumers |
|---|---|---|
| `document.version-published` | document reference | Hephaestus, Iris |
| `document.deleted` | `documentId` | Hephaestus, Loculus cleanup |

### Kriterion (`kriterion.events`)

| Event | Payload | Consumers |
|---|---|---|
| `evaluation.completed` | `agentVersionId`, `suiteId`, scores | Agora (show quality per version), Iris |

## Commands

**Built:** Hephaestus accepts `task.create` on `hephaestus.commands` (`../contracts/hephaestus.asyncapi.yaml`, the `receive` operation; Krepis's `EventsModule` `commands` option), with `task` (a `CreateTaskRequest`) or `template` (`templateId` plus a `CreateTaskFromTemplateRequest`) and `automationId`. Only platform services (`actor.sub_type: service`) may send it. Differences from the table below: `concurrencyKey` is `concurrency: { key, policy }` inside `task` or `template` (`tasks.md`, Concurrency; a skip is `task.create-rejected` with `TASK_CONCURRENCY_SKIPPED`), no `automationId` on the task itself, and `task.cancel` isn't built. Kairos sends it (`DomainEvents.send` in Krepis: an outbox row for `hephaestus.commands`, with the sending service as `actor`; `EventsModule`'s `send` option declares the receiver's exchange) with a run's ID as its `eventId`.

| Command | Receiver | Payload | Outcome events |
|---|---|---|---|
| `task.create` | Hephaestus (`hephaestus.commands`) | `projectId`, `agentId` or `templateId` + version, `inputs`, `automationId`, `concurrencyKey`; `eventId` is the idempotency key | `task.created` or `task.create-rejected` |
| `task.cancel` | Hephaestus | `taskId`, `reason` | `task.cancelled` |

- The same application service handles a command and the matching HTTP endpoint, so both paths validate the same way (see `../CLAUDE.md`).
- A redelivered `task.create` with an `eventId` Hephaestus has seen returns the same outcome again (re-publishes `task.created` for the existing task) instead of creating a second task. Krepis's inbox hands commands to their handler every time for this (events it skips).
- A command that can never succeed gets `task.create-rejected` with the code the HTTP API would give (`VALIDATION_FAILED`, `AGENT_NOT_PUBLISHED`, `PROJECT_ARCHIVED`, `NOT_FOUND`, `FORBIDDEN`, …) and isn't retried; a failure that may pass (a dependency down) is retried and then dead-lettered like an event.

## Open questions

None at the moment. Notifications are consumed by Kerykes (see `notifications.md`).
