# Aether OS

Aether OS is a platform for building, running and supporting AI agents. It is both an **agent factory** and an **organizational operating system**:

- **Agent factory:** define agents and teams of agents (councils), version them, give them tools, skills and knowledge, run them in hardened sandboxes, and measure how well they do.
- **Organizational OS:** model the organization the agents work in (organizations, projects, people and their roles, knowledge, connected systems), so that people and agents can share work, follow the same rules and see what the other is doing.

Agents do real work as **tasks**: a brief, acceptance criteria that are checked before a task can succeed, and **artifacts** as the outcome (text, files, pull requests) that people can review, approve or send back. People also work with agents directly, in **sessions**: conversations streamed over [AG-UI](https://docs.ag-ui.com). Every model call goes through one gateway that picks the key, enforces budgets and meters the cost. Every service is traced and logged.

Aether OS is a set of independently deployable services, each owning its own domain and database. They talk through HTTP APIs and RabbitMQ events, never through each other's databases. This repository is a single pnpm workspace with every service, the shared library and the API contracts.

## Services

| Service | Port | Responsibility | Status |
|---|---|---|---|
| **Iris** | 3000 (3010 with `pnpm start:dev`) | The web interface for operating Aether OS (Next.js): agents, tasks, reviews, knowledge, connections, budgets, automations, the inbox | Active |
| **Atlas** | 3012 | The management interface (Next.js), for an organization's owners and admins: its departments, teams and people | Active |
| **Polis** | 3001 | Tenancy: organizations, projects, and memberships (who belongs where, with what role) | Active |
| **Hephaestus** | 3002 | Runs agents: tasks and subtasks, executions in sandboxes, artifacts, reviews, verification, task templates, tool servers (MCP), and sessions with agents and councils | Active |
| **Pistis** | 3003 | Authentication: an OpenID Connect provider and the only token issuer. Users and their linked identities, password and external sign-in, service accounts and API keys, task and session tokens | Active |
| **Proxenos** | 3004 | Connections to external systems: the GitHub App, repositories linked to projects, repository tokens, verified webhooks turned into events | Active |
| **Kairos** | 3005 | Automations: triggers (such as a GitHub issue) bound to an agent, which create tasks | Active |
| **Kerykes** | 3006 | Notifications: an inbox per person and email, for reviews waiting, failed or paused tasks, budgets and memberships | Active |
| **Loculus** | 3007 | Files: each project's files in S3-compatible storage, uploaded and downloaded with signed URLs | Active |
| **Agora** | 3008 | Agent management: agents and their immutable versions, skills, and councils (teams of agents) | Active |
| **Seshat** | 3009 | Project knowledge: documents, decisions, facts, conventions and lessons, with hybrid search (keywords and meaning) | Active |
| **Pylon** | 3011 | The model gateway: every model call and embedding goes through it, with the model catalogue, provider keys, metering and budgets | Active |
| **Ergon** | 3013 | Work management: work items that people and agents do together, who is assigned, what blocks what, and what happened | Active (first slice) |
| **Episteme** | 3014 | Knowledge governance: the organization's policies, procedures and other authoritative knowledge, their versions, review, publication and stewardship | Shell (no domain yet) |
| **Krepis** | – | `@aether-os/krepis`, the shared foundation library for the NestJS services: tokens and permissions, events and the outbox, transactions, pagination, HTTP conventions, telemetry and logging | Active (library) |
| **Themis** | – | Policies: versioned Rego policy sets per organization and project, served to OPA, enforced with the Agent Policy Specification | Planned |
| **Echo** | – | Voice: talking to agents over WebRTC, in the same session as the chat | Proposed |
| **Kriterion** | – | Evaluation of agent quality, per agent and skill version | Separate project |

The API of each service is specified in [`contracts/`](contracts/) (OpenAPI and AsyncAPI). Every service serves `/health/live` and `/health`.

## Infrastructure

`docker compose up -d` starts the shared infrastructure for local development. All credentials are fixed, local-only values.

| What | Port | Used for |
|---|---|---|
| Postgres | 5432 | One database per service (`aether` / `aether`) |
| RabbitMQ | 5672 (UI 15672) | Events and commands between services (`aether` / `aether`) |
| OpenBao | 8200 | Secrets: provider keys, credentials (dev mode, token `dev-root-token`) |
| OPA | 8181 | Policy evaluation |
| OpenTelemetry Collector | 4317 (gRPC), 4318 (HTTP) | Traces and logs from every service |
| Jaeger | 16686 | Traces |
| Langfuse | 3100 | Traces of agent runs: prompts, model and tool calls, cost |
| Grafana | 3300 | Logs (Loki), linked to traces |
| RustFS | 9100 (console 9101) | S3-compatible storage for Loculus and Langfuse |
| Mailpit | 1025 (UI 8025) | Catches all local email |
| Uptime Kuma | 3400 | Health of every service and the infrastructure |
| Dashy | 3500 | Start page linking all of the above |

## Getting started

```bash
pnpm install        # the whole workspace, from this directory
pnpm start:dev      # the infrastructure, then every service and Iris in watch mode
```

Then open Iris at `http://localhost:3010`, or Dashy at `http://localhost:3500` for everything else.

```bash
pnpm build | lint | test | test:e2e    # across every package (test:e2e needs Docker)
pnpm --filter polis test               # one package
```

## Learn more

- [`CLAUDE.md`](CLAUDE.md): how the pieces fit, the conventions every service follows, and local development in detail. Each service has a `CLAUDE.md` of its own.
- [`docs/`](docs/): the design documents: identity, tasks, events, Git, models, knowledge, skills, councils, interaction, notifications, files, the API and engineering conventions.
