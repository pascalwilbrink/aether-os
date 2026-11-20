import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, type Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  mapPage,
  Transactional,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@hephaestus/core';

import type { AddModelPriceRequest } from './dto/add-model-price.request.js';
import type { CreateModelRequest } from './dto/create-model.request.js';
import type { ModelPriceResponse } from './dto/model-price.response.js';
import type { ModelResponse } from './dto/model.response.js';
import type { UpdateModelRequest } from './dto/update-model.request.js';
import type { Rates } from './model-cost.js';
import { ModelPriceEntity } from './model-price.entity.js';
import { ModelMapper } from './model.mapper.js';
import { ModelEntity, type ModelStatus } from './model.entity.js';
import {
  ModelAlreadyExistsError,
  ModelNotAvailableError,
  ModelPriceInvalidError,
} from './model.errors.js';
import { isSelfHosted } from './model-key-settings.js';

/** What the gateway needs to call and price a model. */
export interface CatalogEntry {
  status: ModelStatus;
  /** The price in force; null before the first one starts. */
  price: ({ id: string } & Rates) | null;
}

/**
 * The platform's model catalogue (docs/models.md, Models): models and their
 * versioned prices. Anyone with a token reads it; only platform services
 * with `platform:manage` change it (routes); agent versions are checked
 * against it, and the gateway prices calls with it.
 */
@Injectable()
export class ModelCatalogService {
  constructor(
    @InjectRepository(ModelEntity)
    private readonly models: Repository<ModelEntity>,
    @InjectRepository(ModelPriceEntity)
    private readonly prices: Repository<ModelPriceEntity>,
    private readonly mapper: ModelMapper,
    private readonly access: AccessControl,
  ) {}

  async list(
    filters: { status?: ModelStatus; provider?: ApiTypes.ModelProvider },
    page: PageRequest,
  ): Promise<Page<ModelResponse>> {
    const where: { status?: ModelStatus; provider?: string } = {};
    if (filters.status) where.status = filters.status;
    if (filters.provider) where.provider = filters.provider;
    const entities = await findPage(
      this.models,
      { where, sortBy: 'name', direction: 'ASC' },
      page,
    );
    const current = await this.currentPrices(
      entities.items.map((entity) => entity.id),
      new Date(),
    );
    return mapPage(entities, (entity) =>
      this.mapper.toResponse(entity, current.get(entity.id) ?? null),
    );
  }

  async findById(modelId: string): Promise<ModelResponse> {
    const entity = await this.load(modelId);
    const current = await this.currentPrices([modelId], new Date());
    return this.mapper.toResponse(entity, current.get(modelId) ?? null);
  }

  @Transactional()
  async create(dto: CreateModelRequest): Promise<ModelResponse> {
    const now = new Date();
    const createdBy = this.access.principal().sub;
    const entity = this.mapper.toEntity(dto, createdBy, now);
    try {
      await this.models.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ModelAlreadyExistsError(dto.provider, dto.model);
      }
      throw error;
    }
    const price = this.mapper.toPriceEntity(
      entity.id,
      dto.price,
      now,
      createdBy,
      now,
    );
    await this.insertPrice(price);
    return this.mapper.toResponse(entity, price);
  }

  @Transactional()
  async update(
    modelId: string,
    dto: UpdateModelRequest,
  ): Promise<ModelResponse> {
    const entity = await this.load(modelId, true);
    if (this.mapper.update(entity, dto)) {
      entity.version += 1;
      entity.updatedAt = new Date();
      await this.models.save(entity);
    }
    const current = await this.currentPrices([modelId], new Date());
    return this.mapper.toResponse(entity, current.get(modelId) ?? null);
  }

  /** A new price; the model is locked so two can't race past each other. */
  @Transactional()
  async addPrice(
    modelId: string,
    dto: AddModelPriceRequest,
  ): Promise<ModelPriceResponse> {
    await this.load(modelId, true);
    const now = new Date();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : now;
    const latest = await this.prices.findOne({
      where: { modelId },
      order: { effectiveFrom: 'DESC' },
    });
    if (latest && effectiveFrom <= latest.effectiveFrom) {
      throw new ModelPriceInvalidError(modelId, latest.effectiveFrom);
    }
    const { effectiveFrom: _from, ...price } = dto;
    const entity = this.mapper.toPriceEntity(
      modelId,
      price,
      effectiveFrom,
      this.access.principal().sub,
      now,
    );
    await this.insertPrice(entity);
    return this.mapper.toPriceResponse(entity);
  }

  async listPrices(
    modelId: string,
    page: PageRequest,
  ): Promise<Page<ModelPriceResponse>> {
    await this.load(modelId);
    const entities = await findPage(
      this.prices,
      { where: { modelId }, sortBy: 'effectiveFrom', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toPriceResponse(entity));
  }

  /** Agent versions: only an active model of the catalogue (`MODEL_NOT_AVAILABLE`). */
  async assertAvailable(provider: string, model: string): Promise<void> {
    // An organization's own server (Ollama) has whatever models it has.
    if (isSelfHosted(provider)) {
      return;
    }
    const entity = await this.models.findOneBy({ provider, model });
    if (entity?.status !== 'active') {
      throw new ModelNotAvailableError(provider, model);
    }
  }

  /**
   * The gateway: the model's status and the price in force `at`; null for
   * a model outside the catalogue (an agent version from before it).
   */
  async entryFor(
    provider: string,
    model: string,
    at: Date,
  ): Promise<CatalogEntry | null> {
    const entity = await this.models.findOneBy({ provider, model });
    if (!entity) {
      return null;
    }
    const price = (await this.currentPrices([entity.id], at)).get(entity.id);
    return {
      status: entity.status,
      price: price ? this.mapper.toPriceResponse(price) : null,
    };
  }

  /** The price in force at `at` for each model that has one. */
  private async currentPrices(
    modelIds: string[],
    at: Date,
  ): Promise<Map<string, ModelPriceEntity>> {
    if (modelIds.length === 0) {
      return new Map();
    }
    const rows = await this.prices
      .createQueryBuilder('price')
      .distinctOn(['price.modelId'])
      .where({ modelId: In(modelIds), effectiveFrom: LessThanOrEqual(at) })
      .orderBy('price.modelId')
      .addOrderBy('price.effectiveFrom', 'DESC')
      .getMany();
    return new Map(rows.map((row) => [row.modelId, row]));
  }

  private async insertPrice(entity: ModelPriceEntity): Promise<void> {
    // TypeORM's insert types don't take jsonb columns typed as interfaces.
    await this.prices.insert(
      entity as Parameters<Repository<ModelPriceEntity>['insert']>[0],
    );
  }

  private async load(modelId: string, forUpdate = false): Promise<ModelEntity> {
    const entity = await this.models.findOne({
      where: { id: modelId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Model ${modelId} not found`);
    }
    return entity;
  }
}
