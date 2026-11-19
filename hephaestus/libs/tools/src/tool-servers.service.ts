import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  AccessControl,
  SecretStore,
  SecretStoreUnavailableError,
  Transactional,
  type ApiTypes,
} from '@hephaestus/core';
import { OrganizationsService } from '@hephaestus/tenancy';

import {
  ToolConnector,
  type ConnectedTools,
  type ToolServerConnection,
} from './tool-connector.js';
import { ToolServerEntity } from './tool-server.entity.js';
import {
  ToolServerAlreadyExistsError,
  ToolServerInvalidError,
  ToolServerUnavailableError,
} from './tool-server.errors.js';
import {
  headerNameOf,
  hintOf,
  ToolServerMapper,
} from './tool-server.mapper.js';
import {
  toolServerProblem,
  type ToolServerPolicy,
} from './tool-server-policy.js';

/** Tool servers one organization may have. */
export const MAX_TOOL_SERVERS = 50;

export const TOOL_SERVER_POLICY = Symbol('TOOL_SERVER_POLICY');

/** Where a tool server's credential lives in OpenBao. */
export function toolServerCredentialPath(
  organizationId: string,
  toolServerId: string,
): string {
  return `orgs/${organizationId}/tool-servers/${toolServerId}`;
}

/** What people are told when OpenBao fails, by why (never a path or a value). */
const UNAVAILABLE: Record<SecretStoreUnavailableError['reason'], string> = {
  'not-configured':
    "Credentials can't be stored: OpenBao isn't configured for Hephaestus (OPENBAO_ADDR and OPENBAO_TOKEN).",
  refused:
    "Credentials can't be stored: OpenBao refused Hephaestus's token (OPENBAO_TOKEN).",
  unreachable:
    "Credentials can't be stored right now: OpenBao isn't answering. Try again in a moment.",
};

/**
 * An organization's tool servers (MCP): registering them (`org:manage`),
 * their credentials (`org:secret:write`, in OpenBao, written in the same
 * transaction as the row so a failure leaves nothing behind), listing what
 * one offers, and connecting to them for a run (`connect`).
 */
@Injectable()
export class ToolServersService {
  private readonly logger = new Logger(ToolServersService.name);

  constructor(
    @InjectRepository(ToolServerEntity)
    private readonly servers: Repository<ToolServerEntity>,
    private readonly mapper: ToolServerMapper,
    private readonly secrets: SecretStore,
    private readonly organizations: OrganizationsService,
    private readonly access: AccessControl,
    private readonly connector: ToolConnector,
    @Inject(TOOL_SERVER_POLICY) private readonly policy: ToolServerPolicy,
  ) {}

  async list(organizationId: string): Promise<ApiTypes.ToolServerList> {
    await this.organizations.assertExists(organizationId);
    const entities = await this.servers.find({
      where: { organizationId },
      order: { name: 'ASC' },
      take: MAX_TOOL_SERVERS,
    });
    return { items: entities.map((entity) => this.mapper.toResponse(entity)) };
  }

  async get(
    organizationId: string,
    toolServerId: string,
  ): Promise<ApiTypes.ToolServerResponse> {
    await this.organizations.assertExists(organizationId);
    return this.mapper.toResponse(
      await this.load(organizationId, toolServerId),
    );
  }

  /** The names among `names` that are none of the organization's tool servers. */
  async unknownNames(
    organizationId: string,
    names: readonly string[],
  ): Promise<string[]> {
    if (names.length === 0) {
      return [];
    }
    const found = await this.servers.find({
      where: { organizationId, name: In([...names]) },
      select: { name: true },
    });
    const known = new Set(found.map((entity) => entity.name));
    return names.filter((name) => !known.has(name));
  }

  @Transactional()
  async create(
    organizationId: string,
    dto: ApiTypes.CreateToolServerRequest,
  ): Promise<ApiTypes.ToolServerResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    this.assertAllowed(dto.url, dto.auth.type);
    if (
      await this.servers.exists({ where: { organizationId, name: dto.name } })
    ) {
      throw new ToolServerAlreadyExistsError(dto.name);
    }
    if (
      (await this.servers.count({ where: { organizationId } })) >=
      MAX_TOOL_SERVERS
    ) {
      throw new ToolServerInvalidError(
        `An organization has at most ${MAX_TOOL_SERVERS} tool servers.`,
      );
    }
    const entity = this.mapper.toEntity(
      organizationId,
      dto,
      this.access.principal().sub,
      new Date(),
    );
    await this.servers.insert(entity);
    return this.mapper.toResponse(entity);
  }

  /**
   * A new URL or authentication drops the credential: it was set for where
   * and how it went before.
   */
  @Transactional()
  async update(
    organizationId: string,
    toolServerId: string,
    dto: ApiTypes.UpdateToolServerRequest,
  ): Promise<ApiTypes.ToolServerResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, toolServerId, true);
    this.assertAllowed(dto.url, dto.auth.type);
    const headerName = headerNameOf(dto.auth);
    const moved =
      entity.url !== dto.url ||
      entity.authType !== dto.auth.type ||
      entity.headerName !== headerName;
    const hadCredential = entity.credentialHint !== null;
    entity.description = dto.description ?? '';
    entity.url = dto.url;
    entity.authType = dto.auth.type;
    entity.headerName = headerName;
    entity.updatedAt = new Date();
    if (moved) {
      clearCredential(entity);
    }
    await this.servers.save(entity);
    if (moved && hadCredential) {
      await this.store(() =>
        this.secrets.delete(
          toolServerCredentialPath(organizationId, entity.id),
        ),
      );
    }
    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async remove(organizationId: string, toolServerId: string): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.servers.findOne({
      where: { organizationId, id: toolServerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entity) {
      return;
    }
    await this.servers.delete({ id: entity.id });
    if (entity.credentialHint !== null) {
      await this.store(() =>
        this.secrets.delete(
          toolServerCredentialPath(organizationId, entity.id),
        ),
      );
    }
  }

  @Transactional()
  async setCredential(
    organizationId: string,
    toolServerId: string,
    value: string,
  ): Promise<ApiTypes.ToolServerResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, toolServerId, true);
    if (entity.authType !== 'header') {
      throw new ToolServerInvalidError(
        `Tool server ${entity.name} doesn't take a credential: its authentication is ${entity.authType}.`,
      );
    }
    const now = new Date();
    entity.credentialHint = hintOf(value);
    entity.credentialUpdatedBy = this.access.principal().sub;
    entity.credentialUpdatedAt = now;
    entity.updatedAt = now;
    await this.servers.save(entity);
    await this.store(() =>
      this.secrets.write(toolServerCredentialPath(organizationId, entity.id), {
        value: value.trim(),
      }),
    );
    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async removeCredential(
    organizationId: string,
    toolServerId: string,
  ): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, toolServerId, true);
    if (entity.credentialHint === null) {
      return;
    }
    clearCredential(entity);
    entity.updatedAt = new Date();
    await this.servers.save(entity);
    await this.store(() =>
      this.secrets.delete(toolServerCredentialPath(organizationId, entity.id)),
    );
  }

  /**
   * What the server offers now. A `task-token` server is sent the caller's
   * own token (it is one of Aether-os's own: the policy says so).
   */
  async listTools(
    organizationId: string,
    toolServerId: string,
    callerToken: string,
  ): Promise<ApiTypes.ToolList> {
    await this.organizations.assertExists(organizationId);
    const entity = await this.load(organizationId, toolServerId);
    try {
      const connection = await this.connection(entity, undefined, callerToken);
      return { items: await this.connector.describe(connection) };
    } catch (error) {
      if (error instanceof ToolServerUnavailableError) {
        throw new ServiceUnavailableException(
          `Tool server ${entity.name} didn't answer: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Opens the enabled tools of an agent version for one run, as the task
   * (`taskToken` goes to `task-token` servers). `ToolServerUnavailableError`
   * says whether retrying could help.
   */
  async connect(
    organizationId: string,
    configured: readonly ApiTypes.AgentToolConfiguration[],
    taskToken: string,
  ): Promise<ConnectedTools> {
    const enabled = configured.filter((tool) => tool.enabled);
    if (enabled.length === 0) {
      return { tools: {}, close: async () => undefined };
    }
    const entities = await this.servers.find({
      where: { organizationId, name: In(enabled.map((tool) => tool.name)) },
    });
    const byName = new Map(entities.map((entity) => [entity.name, entity]));
    const connections: ToolServerConnection[] = [];
    for (const tool of enabled) {
      const entity = byName.get(tool.name);
      if (!entity) {
        throw new ToolServerUnavailableError(
          `The organization has no tool server named ${tool.name}`,
          false,
        );
      }
      connections.push(await this.connection(entity, tool.tools, taskToken));
    }
    return this.connector.connect(connections);
  }

  private async connection(
    entity: ToolServerEntity,
    tools: readonly string[] | undefined,
    token: string,
  ): Promise<ToolServerConnection> {
    // The platform's policy may have changed since it was registered.
    const problem = toolServerProblem(entity.url, entity.authType, this.policy);
    if (problem) {
      throw new ToolServerUnavailableError(
        `Tool server ${entity.name}: ${problem}`,
        false,
      );
    }
    const headers: Record<string, string> = {};
    if (entity.authType === 'task-token') {
      headers.Authorization = `Bearer ${token}`;
    } else if (entity.authType === 'header' && entity.headerName) {
      headers[entity.headerName] = await this.credential(entity);
    }
    return { name: entity.name, url: entity.url, headers, tools };
  }

  private async credential(entity: ToolServerEntity): Promise<string> {
    let secret: Record<string, unknown> | null;
    try {
      secret = await this.secrets.read(
        toolServerCredentialPath(entity.organizationId, entity.id),
      );
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) {
        throw new ToolServerUnavailableError(
          `The credential of tool server ${entity.name} couldn't be read: ${error.message}`,
          error.reason === 'unreachable',
        );
      }
      throw error;
    }
    const value = secret?.value;
    if (typeof value !== 'string' || value === '') {
      throw new ToolServerUnavailableError(
        `Tool server ${entity.name} has no credential: set one`,
        false,
      );
    }
    return value;
  }

  private assertAllowed(url: string, authType: ApiTypes.ToolServerAuthType) {
    const problem = toolServerProblem(url, authType, this.policy);
    if (problem) {
      throw new ToolServerInvalidError(problem);
    }
  }

  private async load(
    organizationId: string,
    toolServerId: string,
    lock = false,
  ): Promise<ToolServerEntity> {
    const entity = await this.servers.findOne({
      where: { organizationId, id: toolServerId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Tool server ${toolServerId} not found.`);
    }
    return entity;
  }

  /**
   * OpenBao failing is a 503 that rolls the change back, saying why; the
   * cause is logged too.
   */
  private async store(call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) {
        this.logger.warn(`Tool server credential not stored: ${error.message}`);
        throw new ServiceUnavailableException(UNAVAILABLE[error.reason]);
      }
      throw error;
    }
  }
}

function clearCredential(entity: ToolServerEntity): void {
  entity.credentialHint = null;
  entity.credentialUpdatedBy = null;
  entity.credentialUpdatedAt = null;
}
