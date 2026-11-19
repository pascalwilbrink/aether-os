import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  SecretStore,
  SecretStoreUnavailableError,
  Transactional,
  type ApiTypes,
} from '@hephaestus/core';
import { OrganizationsService } from '@hephaestus/tenancy';

import { ModelKeyEntity, type ModelKeyScope } from './model-key.entity.js';
import { hintOf, ModelKeyMapper } from './model-key.mapper.js';

/** Where a provider key lives in OpenBao (docs/models.md, Keys). */
export function modelKeyPath(
  organizationId: string,
  provider: string,
  agentId?: string,
): string {
  return agentId
    ? `orgs/${organizationId}/agents/${agentId}/llm/${provider}`
    : `orgs/${organizationId}/llm/${provider}`;
}

/**
 * Provider keys (docs/models.md, Keys: BYOK): an organization's, used by
 * all its agents, and an agent's own, used instead. Keys go to OpenBao and
 * are never returned; `model_keys` only records that one is set. Setting
 * one writes the row and then the secret in one transaction, so a failed
 * write leaves nothing behind. Callers check the agent; the routes the
 * permissions (`org:secret:write`).
 */
@Injectable()
export class ModelKeysService {
  constructor(
    @InjectRepository(ModelKeyEntity)
    private readonly keys: Repository<ModelKeyEntity>,
    private readonly mapper: ModelKeyMapper,
    private readonly secrets: SecretStore,
    private readonly organizations: OrganizationsService,
    private readonly access: AccessControl,
  ) {}

  async list(
    organizationId: string,
    scope: ModelKeyScope,
    scopeId: string,
  ): Promise<ApiTypes.ModelKeyList> {
    const entities = await this.keys.find({
      where: { organizationId, scope, scopeId },
      order: { provider: 'ASC' },
    });
    return { items: entities.map((entity) => this.mapper.toResponse(entity)) };
  }

  @Transactional()
  async set(
    organizationId: string,
    scope: ModelKeyScope,
    scopeId: string,
    provider: ApiTypes.ModelProvider,
    apiKey: string,
  ): Promise<ApiTypes.ModelKeyResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const now = new Date();
    const entity =
      (await this.keys.findOne({
        where: { organizationId, scope, scopeId, provider },
        lock: { mode: 'pessimistic_write' },
      })) ??
      this.mapper.toEntity(organizationId, scope, scopeId, provider, now);
    entity.hint = hintOf(apiKey);
    entity.updatedBy = this.access.principal().sub;
    entity.updatedAt = now;
    await this.keys.save(entity);
    await this.store(() =>
      this.secrets.write(this.path(organizationId, scope, scopeId, provider), {
        apiKey: apiKey.trim(),
      }),
    );
    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async remove(
    organizationId: string,
    scope: ModelKeyScope,
    scopeId: string,
    provider: ApiTypes.ModelProvider,
  ): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);
    await this.keys.delete({ organizationId, scope, scopeId, provider });
    await this.store(() =>
      this.secrets.delete(this.path(organizationId, scope, scopeId, provider)),
    );
  }

  private path(
    organizationId: string,
    scope: ModelKeyScope,
    scopeId: string,
    provider: string,
  ): string {
    return modelKeyPath(
      organizationId,
      provider,
      scope === 'agent' ? scopeId : undefined,
    );
  }

  /** OpenBao not answering is a 503, and rolls the change back. */
  private async store(call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) {
        throw new ServiceUnavailableException(
          "Keys can't be stored right now (OpenBao isn't answering). Try again.",
        );
      }
      throw error;
    }
  }
}
