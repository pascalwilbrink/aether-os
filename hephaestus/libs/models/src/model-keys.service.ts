import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  SecretStore,
  SecretStoreUnavailableError,
  Transactional,
  type ApiTypes,
  type Env,
} from '@hephaestus/core';
import { OrganizationsService } from '@hephaestus/tenancy';

import { ModelKeyEntity, type ModelKeyScope } from './model-key.entity.js';
import { hintOf, ModelKeyMapper } from './model-key.mapper.js';
import { checkModelKeySettings } from './model-key-settings.js';
import { ModelKeyInvalidError } from './model.errors.js';

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
/** What people are told when OpenBao fails, by why (never a path or a value). */
const UNAVAILABLE: Record<SecretStoreUnavailableError['reason'], string> = {
  'not-configured':
    "Keys can't be stored: OpenBao isn't configured for Hephaestus (OPENBAO_ADDR and OPENBAO_TOKEN).",
  refused:
    "Keys can't be stored: OpenBao refused Hephaestus's token (OPENBAO_TOKEN).",
  unreachable:
    "Keys can't be stored right now: OpenBao isn't answering. Try again in a moment.",
};

@Injectable()
export class ModelKeysService {
  private readonly logger = new Logger(ModelKeysService.name);

  constructor(
    @InjectRepository(ModelKeyEntity)
    private readonly keys: Repository<ModelKeyEntity>,
    private readonly mapper: ModelKeyMapper,
    private readonly secrets: SecretStore,
    private readonly organizations: OrganizationsService,
    private readonly access: AccessControl,
    private readonly config: ConfigService<Env, true>,
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
    input: ApiTypes.SetModelKeyRequest,
  ): Promise<ApiTypes.ModelKeyResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const settings = checkModelKeySettings(provider, input, {
      allowPrivate: this.config.get('MODEL_ENDPOINT_ALLOW_PRIVATE', {
        infer: true,
      }),
    });
    if ('problem' in settings) {
      throw new ModelKeyInvalidError(settings.problem);
    }
    const now = new Date();
    const entity =
      (await this.keys.findOne({
        where: { organizationId, scope, scopeId, provider },
        lock: { mode: 'pessimistic_write' },
      })) ??
      this.mapper.toEntity(organizationId, scope, scopeId, provider, now);
    entity.hint = settings.apiKey ? hintOf(settings.apiKey) : null;
    entity.baseUrl = settings.baseUrl ?? null;
    entity.updatedBy = this.access.principal().sub;
    entity.updatedAt = now;
    await this.keys.save(entity);
    await this.store(() =>
      this.secrets.write(this.path(organizationId, scope, scopeId, provider), {
        ...settings,
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

  /**
   * OpenBao failing is a 503 that rolls the change back, saying why (not
   * configured, refusing Hephaestus's token, or not answering), so whoever
   * runs Aether-os can tell; the cause is logged too.
   */
  private async store(call: () => Promise<void>): Promise<void> {
    try {
      await call();
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) {
        this.logger.warn(`Model key not stored: ${error.message}`);
        throw new ServiceUnavailableException(UNAVAILABLE[error.reason]);
      }
      throw error;
    }
  }
}
