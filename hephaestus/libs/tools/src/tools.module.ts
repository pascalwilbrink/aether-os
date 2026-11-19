import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecretsModule, type Env } from '@hephaestus/core';
import { TenancyModule } from '@hephaestus/tenancy';

import { McpToolConnector } from './mcp-tool-connector.js';
import { ToolConnector } from './tool-connector.js';
import { ToolServerEntity } from './tool-server.entity.js';
import { ToolServerMapper } from './tool-server.mapper.js';
import type { ToolServerPolicy } from './tool-server-policy.js';
import { ToolServersController } from './tool-servers.controller.js';
import {
  TOOL_SERVER_POLICY,
  ToolServersService,
} from './tool-servers.service.js';

/** Tool servers (MCP) agent versions take tools from (libs/tools). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ToolServerEntity]),
    TenancyModule,
    SecretsModule,
  ],
  controllers: [ToolServersController],
  providers: [
    {
      provide: TOOL_SERVER_POLICY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ToolServerPolicy => ({
        allowPrivate: config.get('TOOL_SERVER_ALLOW_PRIVATE', { infer: true }),
        trustedOrigins: config.get('TOOL_SERVER_TRUSTED_ORIGINS', {
          infer: true,
        }),
      }),
    },
    {
      provide: ToolConnector,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new McpToolConnector({
          allowPrivate: config.get('TOOL_SERVER_ALLOW_PRIVATE', {
            infer: true,
          }),
          timeoutMs: config.get('TOOL_CALL_TIMEOUT_MS', { infer: true }),
        }),
    },
    ToolServerMapper,
    ToolServersService,
  ],
  exports: [ToolServersService],
})
export class ToolsModule {}
