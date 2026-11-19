#!/usr/bin/env node
// Generates TypeScript types for the events in an AsyncAPI spec:
//
//   aether-asyncapi-types <spec.asyncapi.yaml> <out.ts> --name Polis
//
// For every message: an interface for its `payload` (the envelope's
// `payload`, named after the event: `organization.created` →
// `OrganizationCreated`), a map from event type to payload
// (`PolisEventPayloads`), the `PolisEventType` union and the list of event
// types (`POLIS_EVENT_TYPES`). Messages of `receive` operations are the
// commands the service accepts (docs/events.md, Commands): they get the same
// payload interfaces, but their own map, union and list
// (`HephaestusCommandPayloads`, `HEPHAESTUS_COMMAND_TYPES`), never the
// event ones. The spec is validated with the official AsyncAPI parser
// first; any error fails the run.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

import { Parser } from '@asyncapi/parser';
import { compile } from 'json-schema-to-typescript';

const [specPath, outPath, ...rest] = process.argv.slice(2);
const nameIndex = rest.indexOf('--name');
const name = nameIndex >= 0 ? rest[nameIndex + 1] : undefined;
if (!specPath || !outPath || !name) {
  console.error('Usage: aether-asyncapi-types <spec> <out.ts> --name <Service>');
  process.exit(2);
}

const { document, diagnostics } = await new Parser().parse(
  readFileSync(specPath, 'utf8'),
  { source: specPath },
);
const errors = diagnostics.filter((d) => d.severity === 0);
if (!document || errors.length > 0) {
  for (const d of errors) console.error(`${d.path.join('.')}: ${d.message}`);
  console.error(`${specPath} is not a valid AsyncAPI document.`);
  process.exit(1);
}

const pascal = (eventType) =>
  eventType
    .split(/[.\-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/**
 * The schema's `properties.<key>`, looking into `allOf` members. The last
 * match wins: the envelope says `payload` is an object, the message's own
 * member says which one.
 */
function property(schema, key) {
  let found = schema.properties?.[key];
  for (const member of schema.allOf ?? []) {
    found = property(member, key) ?? found;
  }
  return found;
}

/** Drops the parser's `x-parser-*` annotations. */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith('x-parser-'))
        .map(([key, v]) => [key, clean(v)]),
    );
  }
  return value;
}

const received = new Set();
for (const operation of document.operations()) {
  if (operation.action() === 'receive') {
    for (const message of operation.messages()) received.add(message.name());
  }
}

const events = [];
for (const message of document.allMessages()) {
  const eventType = message.name();
  const payload = property(message.payload().json(), 'payload');
  if (!eventType || !payload) {
    console.error(`Message ${message.id()} needs a name and an envelope with a payload.`);
    process.exit(1);
  }
  events.push({
    eventType,
    typeName: pascal(eventType),
    schema: clean(payload),
    command: received.has(eventType),
  });
}
events.sort((a, b) => a.eventType.localeCompare(b.eventType));

const parts = [];
for (const { eventType, typeName, schema } of events) {
  const ts = await compile(
    { ...schema, title: undefined, description: `Payload of \`${eventType}\`.` },
    typeName,
    {
      bannerComment: '',
      additionalProperties: false,
      format: false,
      strictIndexSignatures: true,
      // Plain arrays rather than `[T, ...T[]]` tuples for minItems.
      ignoreMinAndMaxItems: true,
    },
  );
  parts.push(ts.trim());
}

const upper = name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
const constName = `${upper}_EVENT_TYPES`;
const published = events.filter((e) => !e.command);
const commands = events.filter((e) => e.command);
const commandTypes = commands.length
  ? `

/** Every command ${name} accepts, mapped to its payload. */
export interface ${name}CommandPayloads {
${commands.map((e) => `  '${e.eventType}': ${e.typeName};`).join('\n')}
}

export type ${name}CommandType = keyof ${name}CommandPayloads;

/** Every command ${name} accepts (on \`${name.toLowerCase()}.commands\`). */
export const ${upper}_COMMAND_TYPES = [
${commands.map((e) => `  '${e.eventType}',`).join('\n')}
] as const satisfies readonly ${name}CommandType[];
`
  : '\n';
const output = `// This file is generated from ${basename(specPath)} by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run \`pnpm generate:api\`.

${parts.join('\n\n')}

/** Every ${name} event type, mapped to its payload. */
export interface ${name}EventPayloads {
${published.map((e) => `  '${e.eventType}': ${e.typeName};`).join('\n')}
}

export type ${name}EventType = keyof ${name}EventPayloads;

/** Every ${name} event type in the spec. */
export const ${constName} = [
${published.map((e) => `  '${e.eventType}',`).join('\n')}
] as const satisfies readonly ${name}EventType[];${commandTypes}`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, output);
console.log(
  `${specPath} → ${outPath} (${published.length} events, ${commands.length} commands)`,
);
