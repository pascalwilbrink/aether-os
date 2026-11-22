import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { ModelGateway, ModelsModule } from '@hephaestus/models';
import {
  agentTracing,
  HttpKnowledgeBase,
  KnowledgeBase,
  NoKnowledgeBase,
} from '@hephaestus/runner';
import { SkillsModule, SkillsService } from '@hephaestus/skills';
import { TenancyModule } from '@hephaestus/tenancy';
import { ToolServersService, ToolsModule } from '@hephaestus/tools';

import { SessionAgent } from './session-agent.js';
import { SessionMessageEntity } from './session-message.entity.js';
import { SessionMessagesService } from './session-messages.service.js';
import { SessionReaper } from './session-reaper.js';
import { SessionRunsService } from './session-runs.service.js';
import { PistisSessionTokens, SessionTokens } from './session-tokens.js';
import { SessionEntity } from './session.entity.js';
import { SessionMapper } from './session.mapper.js';
import { SESSION_OPTIONS, type SessionOptions } from './session.options.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

/**
 * Sessions (../../../../docs/interaction.md): a person talking to an agent
 * over AG-UI, with a session token from Pistis. The session token and the
 * project's knowledge are ports, bound here from the configuration.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SessionEntity, SessionMessageEntity]),
    TenancyModule,
    AgentsModule,
    ModelsModule,
    ToolsModule,
    SkillsModule,
  ],
  controllers: [SessionsController],
  providers: [
    {
      provide: SESSION_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SessionOptions => ({
        idleTimeoutMs: config.get('SESSION_IDLE_TIMEOUT_MS', { infer: true }),
        runTimeoutMs: config.get('SESSION_RUN_TIMEOUT_MS', { infer: true }),
        reaperIntervalMs: config.get('SESSION_REAPER_INTERVAL_MS', {
          infer: true,
        }),
      }),
    },
    {
      provide: SessionTokens,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new PistisSessionTokens({
          issuer: config.get('PISTIS_ISSUER', { infer: true }),
          clientId: config.get('PISTIS_CLIENT_ID', { infer: true }),
          clientSecret: config.get('PISTIS_CLIENT_SECRET', { infer: true }),
        }),
    },
    {
      // The project's knowledge, read-only, with SESHAT_URL.
      provide: KnowledgeBase,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get('SESHAT_URL', { infer: true });
        return url ? new HttpKnowledgeBase(url) : new NoKnowledgeBase();
      },
    },
    {
      provide: SessionAgent,
      inject: [ModelGateway, ToolServersService, SkillsService, KnowledgeBase],
      useFactory: (
        gateway: ModelGateway,
        toolServers: ToolServersService,
        skills: SkillsService,
        knowledge: KnowledgeBase,
      ) =>
        new SessionAgent(
          gateway,
          toolServers,
          skills,
          knowledge,
          agentTracing(process.env),
        ),
    },
    SessionMapper,
    SessionMessagesService,
    SessionsService,
    SessionRunsService,
    SessionReaper,
  ],
  exports: [SessionsService, SessionReaper],
})
export class SessionsModule {}
