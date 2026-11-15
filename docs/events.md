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

**Published** since Polis's outbox landed, and **consumed by Hephaestus** (`hephaestus.polis-events`: the organization and project events, for its copy of their status); the contract is `../contracts/polis.asyncapi.yaml`, which is the source for these events from now on (membership payloads also carry `membershipId`). Not built yet: `organization.deleted` and `project.deleted` (Polis has no deletes), and project memberships.

| Event | Payload | Consumers |
|---|---|---|
| `organization.created` | `organizationId`, `slug` | Pistis, Iris |
| `organization.suspended` / `organization.reactivated` | `organizationId`, `reason` | Every service (reject writes / resume) |
| `organization.deleted` | `organizationId` | Every service (delete tenant data) |
| `project.created` / `project.archived` / `project.deleted` | `projectId` | Hephaestus, Kairos, Themis, Seshat |
| `membership.granted` | `principal`, `scope` (organization or project), `roles` | Pistis, Iris, Kerykes |
| `membership.role-changed` | `principal`, `scope`, `from`, `to` (role lists) | Pistis, every service (drop cached permissions; Kerykes updates its recipient copy) |
| `membership.revoked` | `principal`, `scope` | Pistis, every service |

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

Proxenos, the integrations service (see `git.md`), turns verified provider webhooks into normalized events.

| Event | Payload | Consumers |
|---|---|---|
| `github.issue.opened`, `github.issue.labeled`, `github.issue-comment.created`, … | `repository`, the item's number, `author`, `authorPermission`, `fromAetherOs`, `deliveryId` (the full payload is fetched from Proxenos when needed) | Kairos (triggers) |
| `git.installation-changed` | `installationId`, `repositories` added/removed, `status` | Hephaestus, Kairos |
| `git.pull-request.updated` | `repository`, `number`, `state`, `headSha`, `mergedAt` | Hephaestus (artifact `state`, branch cleanup) |

### Kairos (`kairos.events`)

| Event | Payload | Consumers |
|---|---|---|
| `automation.triggered` | `automationId`, `triggerType`, `deliveryId` | Iris (activity), Kriterion |

Kairos sends `task.create` commands to Hephaestus when an automation fires (below).

### Hephaestus (`hephaestus.events`)

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
| `budget.threshold-reached` | `scope` (task tree / project / organization), `budgetUsd`, `spentUsd` | Kerykes, Iris |

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

| Command | Receiver | Payload | Outcome events |
|---|---|---|---|
| `task.create` | Hephaestus (`hephaestus.commands`) | `projectId`, `agentId` or `templateId` + version, `inputs`, `automationId`, `concurrencyKey`; `eventId` is the idempotency key | `task.created` or `task.create-rejected` |
| `task.cancel` | Hephaestus | `taskId`, `reason` | `task.cancelled` |

- The same application service handles a command and the matching HTTP endpoint, so both paths validate the same way (see `../CLAUDE.md`).
- A redelivered `task.create` with an `eventId` Hephaestus has seen returns the same outcome again (re-publishes `task.created` for the existing task) instead of creating a second task.

## Open questions

None at the moment. Notifications are consumed by Kerykes (see `notifications.md`).
