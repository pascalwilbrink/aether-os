# Aether-os contracts

API contracts shared between Aether-os components, published in the workspace as the `@aether-os/contracts` package. These specs are the source of truth: change the spec first, then regenerate types in each consumer.

Every spec follows `../docs/api.md`: only `GET`, `POST`, `PUT` and `DELETE` (never `PATCH`), paths under `/v1`, IDs as `type: string, format: uuid`, errors as the shared `Problem` schema (RFC 9457), and lists with `limit` / `cursor` → `items` / `nextCursor`.

Shared definitions (the `Problem` schema, the `Limit` and `Cursor` parameters, `NextCursor`, the `BadRequest` and `NotFound` responses) live in `common.openapi.yaml`; service specs reference them with `$ref: './common.openapi.yaml#/components/...'`, and the generator bundles them into each consumer's types.

| Spec | Served by | Consumed by |
|---|---|---|
| `polis.openapi.yaml` | Polis | (Hephaestus, Agora, Kairos, Iris, once wired) |
| `hephaestus.openapi.yaml` | Hephaestus | Iris |
| `polis.asyncapi.yaml` | Polis (events on `polis.events`) | Pistis, every service (once they consume) |

## Event types (AsyncAPI)

`*.asyncapi.yaml` describe the events a service publishes. Give each message a `name` (the event type) and an envelope whose `payload` refers to a named schema. The package's `aether-asyncapi-types` command (`bin/asyncapi-types.mjs`) validates a spec with the official AsyncAPI parser and generates, with `json-schema-to-typescript`, an interface per event payload (`organization.created` → `OrganizationCreated`), the `<Service>EventPayloads` map, the `<Service>EventType` union and `<SERVICE>_EVENT_TYPES`:

```bash
aether-asyncapi-types node_modules/@aether-os/contracts/polis.asyncapi.yaml libs/core/src/events/generated/polis-events.gen.ts --name Polis
```

Polis runs it in `pnpm generate:api`; a consumer of another service's events runs it the same way on that spec. Generated files are committed and checked by CI like the OpenAPI ones.

## Regenerating

```bash
pnpm generate:api                        # from the workspace root: every consumer
pnpm --filter hephaestus generate:api    # -> libs/core/src/api/generated/hephaestus-api.ts
pnpm --filter iris generate:api          # -> lib/api/generated/hephaestus-api.ts
pnpm --filter polis generate:api         # -> libs/core/src/api/generated/polis-api.ts
```

Consumers declare `"@aether-os/contracts": "workspace:*"` and read specs from `node_modules/@aether-os/contracts/`, so the scripts keep working if this package is later published to a registry.

Polis uses [`@hey-api/openapi-ts`](https://heyapi.dev) (types and Zod schemas, `polis/openapi-ts.config.ts`); Hephaestus and Iris still use [openapi-typescript](https://openapi-ts.dev). Generated files are committed, so builds don't depend on running the generator, and CI fails when they're out of date.

**Target** (agreed, see `../docs/engineering.md`): one generator, [`@hey-api/openapi-ts`](https://heyapi.dev), for TypeScript types, Zod schemas and HTTP clients, in every service and in Iris. It replaces `openapi-typescript` and `openapi-fetch`.

- **Polis** (target reached): Zod schemas generated from the spec, DTOs as one-line `createZodDto(zX)` classes, validated by Krepis's `ZodValidationPipe` and responses checked with `@ZodSerializerDto`. The constraints live only in the spec.
- **Hephaestus**: request/response DTO classes `implements ApiSchema<'Name'>` (from `@hephaestus/core`), so `tsc` fails when a controller drifts from the spec. Runtime validation is still done by the class-validator decorators, so keep the constraints in the spec and the decorators in sync, until it moves to Zod like Polis.
- **Iris**: imports `ApiSchema<'Name'>` / `ApiPaths` from `@/lib/api`.

The organization and project endpoints still appear in `hephaestus.openapi.yaml` because Hephaestus still serves them; remove them there when Hephaestus switches to Polis.
