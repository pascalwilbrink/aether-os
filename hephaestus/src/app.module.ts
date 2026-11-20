import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  HEPHAESTUS_COMMAND_TYPES,
  HEPHAESTUS_PUBLISHED_EVENTS,
  HephaestusEventsModule,
  DatabaseModule,
  EventsModule,
  hephaestusConfigModule,
  type Env,
} from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { TenancyModule } from '@hephaestus/tenancy';
import { ArtifactsModule } from '@hephaestus/artifacts';
import { RunnerModule } from '@hephaestus/runner';
import { TasksModule } from '@hephaestus/tasks';
import { TemplatesModule } from '@hephaestus/templates';
import { SkillsModule } from '@hephaestus/skills';
import { ToolsModule } from '@hephaestus/tools';
import { WorkspacesModule } from '@hephaestus/workspaces';

/** The Polis events Hephaestus keeps organization and project status from. */
export const POLIS_SUBSCRIPTIONS = [
  'organization.created',
  'organization.suspended',
  'organization.reactivated',
  'project.created',
  'project.archived',
] as const;

/**
 * Agora's events: Hephaestus's copy of agents and their published versions
 * (libs/agents), which tasks pin and the runner runs.
 */
export const AGORA_SUBSCRIPTIONS = [
  'agent.created',
  'agent.archived',
  'agent-version.published',
  'agent-version.deprecated',
] as const;

/** Proxenos's events Hephaestus handles (docs/git.md). */
export const PROXENOS_SUBSCRIPTIONS = ['git.pull-request.updated'] as const;

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
@Module({
  imports: [
    hephaestusConfigModule(),
    DatabaseModule,
    // Consumes Polis's, Proxenos's and Agora's events from
    // hephaestus.<producer>-events (inbox, retries, dead-lettering), and publishes Hephaestus's own (task events) to
    // hephaestus.events through the outbox.
    EventsModule.forRoot({
      service: 'hephaestus',
      publish: HEPHAESTUS_PUBLISHED_EVENTS,
      subscribe: {
        polis: POLIS_SUBSCRIPTIONS,
        proxenos: PROXENOS_SUBSCRIPTIONS,
        agora: AGORA_SUBSCRIPTIONS,
      },
      // task.create from Kairos (docs/events.md, Commands).
      commands: HEPHAESTUS_COMMAND_TYPES,
      rabbitmq: {
        inject: [ConfigService],
        useFactory: (config: ConfigService<Env, true>) => ({
          url: config.get('RABBITMQ_URL', { infer: true }),
          relayIntervalMs: config.get('OUTBOX_RELAY_INTERVAL_MS', {
            infer: true,
          }),
        }),
      },
    }),
    // Pistis tokens on every request, and the permission table (Krepis).
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        issuer: config.get('PISTIS_ISSUER', { infer: true }),
        jwks: config.get('PISTIS_JWKS', { infer: true }),
      }),
    }),
    HephaestusEventsModule,
    TenancyModule,
    AgentsModule,
    WorkspacesModule,
    TasksModule,
    ArtifactsModule,
    TemplatesModule,
    ToolsModule,
    SkillsModule,
    RunnerModule,
  ],
})
export class AppModule {}
