import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, type Repository } from 'typeorm';

import {
  AccessControl,
  type ApiTypes,
  findPage,
  mapPage,
  Transactional,
  type Page,
  type PageRequest,
} from '@pistis/core';

import { hashApiKey, looksLikeApiKey, newApiKey } from './api-key-secret.js';
import { ApiKeyEntity } from './api-key.entity.js';
import type { ApiKeyResponse } from './dto/api-key.response.js';
import type { CreateApiKeyRequest } from './dto/create-api-key.request.js';
import type { CreateServiceAccountRequest } from './dto/create-service-account.request.js';
import type { CreatedApiKeyResponse } from './dto/created-api-key.response.js';
import type { ServiceAccountResponse } from './dto/service-account.response.js';
import { ServiceAccountEntity } from './service-account.entity.js';
import { ServiceAccountMapper } from './service-account.mapper.js';
import { ServiceAccountDisabledError } from './service-accounts.errors.js';

/** Who a token is for, once an API key or an exchange checked out. */
export interface ServiceAccountIdentity {
  serviceAccountId: string;
  organizationId: string;
}

/**
 * Service accounts and their API keys (docs/identity.md, Principals). The
 * organization in the route is checked by Krepis's guard (the token's
 * organization), and every lookup is scoped to it, so another
 * organization's service account is a 404.
 */
@Injectable()
export class ServiceAccountsService {
  constructor(
    @InjectRepository(ServiceAccountEntity)
    private readonly accounts: Repository<ServiceAccountEntity>,
    @InjectRepository(ApiKeyEntity)
    private readonly keys: Repository<ApiKeyEntity>,
    private readonly mapper: ServiceAccountMapper,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateServiceAccountRequest,
  ): Promise<ServiceAccountResponse> {
    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    await this.accounts.insert(entity);
    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<ServiceAccountResponse>> {
    const entities = await findPage(
      this.accounts,
      { where: { organizationId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    serviceAccountId: string,
  ): Promise<ServiceAccountResponse> {
    return this.mapper.toResponse(
      await this.load(organizationId, serviceAccountId),
    );
  }

  /** Idempotent. */
  disable(organizationId: string, serviceAccountId: string) {
    return this.setStatus(organizationId, serviceAccountId, 'disabled');
  }

  /** Idempotent. */
  enable(organizationId: string, serviceAccountId: string) {
    return this.setStatus(organizationId, serviceAccountId, 'active');
  }

  /** A new key; the key itself is only in this response. */
  @Transactional()
  async createApiKey(
    organizationId: string,
    serviceAccountId: string,
    dto: CreateApiKeyRequest,
  ): Promise<CreatedApiKeyResponse> {
    const account = await this.load(organizationId, serviceAccountId, true);
    if (account.status !== 'active') {
      throw new ServiceAccountDisabledError(serviceAccountId);
    }
    const { key, prefix, hash } = newApiKey();
    const entity = this.mapper.apiKeyToEntity(
      {
        serviceAccountId,
        name: dto.name,
        prefix,
        keyHash: hash,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: this.access.principal().sub,
      },
      new Date(),
    );
    await this.keys.insert(entity);
    const response: ApiTypes.ApiKeyResponse =
      this.mapper.apiKeyToResponse(entity);
    return { ...response, key };
  }

  async listApiKeys(
    organizationId: string,
    serviceAccountId: string,
    page: PageRequest,
  ): Promise<Page<ApiKeyResponse>> {
    await this.load(organizationId, serviceAccountId);
    const entities = await findPage(
      this.keys,
      { where: { serviceAccountId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.apiKeyToResponse(entity));
  }

  @Transactional()
  async revokeApiKey(
    organizationId: string,
    serviceAccountId: string,
    apiKeyId: string,
  ): Promise<void> {
    await this.load(organizationId, serviceAccountId);
    const result = await this.keys.delete({ id: apiKeyId, serviceAccountId });
    if (!result.affected) {
      throw new NotFoundException(`API key ${apiKeyId} not found`);
    }
  }

  /**
   * The active service account an API key belongs to, or null (unknown,
   * revoked, expired, or the account is disabled). Records its use.
   */
  async authenticateApiKey(
    key: string,
  ): Promise<ServiceAccountIdentity | null> {
    if (!looksLikeApiKey(key)) {
      return null;
    }
    const now = new Date();
    const entity = await this.keys.findOne({
      where: [
        { keyHash: hashApiKey(key), expiresAt: IsNull() },
        { keyHash: hashApiKey(key), expiresAt: MoreThan(now) },
      ],
      relations: { serviceAccount: true },
    });
    if (!entity?.serviceAccount || entity.serviceAccount.status !== 'active') {
      return null;
    }
    await this.keys.update({ id: entity.id }, { lastUsedAt: now });
    return {
      serviceAccountId: entity.serviceAccountId,
      organizationId: entity.serviceAccount.organizationId,
    };
  }

  /** An active service account by ID (for token exchange), or null. */
  async findActive(
    serviceAccountId: string,
  ): Promise<ServiceAccountIdentity | null> {
    const entity = await this.accounts.findOneBy({
      id: serviceAccountId,
      status: 'active',
    });
    return entity
      ? { serviceAccountId: entity.id, organizationId: entity.organizationId }
      : null;
  }

  @Transactional()
  private async setStatus(
    organizationId: string,
    serviceAccountId: string,
    status: ServiceAccountEntity['status'],
  ): Promise<ServiceAccountResponse> {
    const entity = await this.load(organizationId, serviceAccountId, true);
    if (entity.status !== status) {
      entity.status = status;
      entity.updatedAt = new Date();
      await this.accounts.save(entity);
    }
    return this.mapper.toResponse(entity);
  }

  private async load(
    organizationId: string,
    serviceAccountId: string,
    forUpdate = false,
  ): Promise<ServiceAccountEntity> {
    const entity = await this.accounts.findOne({
      where: { id: serviceAccountId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(
        `Service account ${serviceAccountId} not found`,
      );
    }
    return entity;
  }
}
