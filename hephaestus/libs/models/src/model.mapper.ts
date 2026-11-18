import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import type { CreateModelRequest } from './dto/create-model.request.js';
import type { ModelPriceResponse } from './dto/model-price.response.js';
import type { ModelResponse } from './dto/model.response.js';
import type { UpdateModelRequest } from './dto/update-model.request.js';
import { fromMicros, toMicros } from './model-cost.js';
import { ModelPriceEntity } from './model-price.entity.js';
import { ModelEntity } from './model.entity.js';

@Injectable()
export class ModelMapper {
  /** A new, active model; its ID (UUIDv7) is generated here. */
  toEntity(dto: CreateModelRequest, createdBy: string, now: Date): ModelEntity {
    return Object.assign(new ModelEntity(), {
      id: uuidv7(),
      provider: dto.provider,
      model: dto.model,
      name: dto.name,
      status: 'active',
      contextWindow: dto.contextWindow ?? null,
      maxOutputTokens: dto.maxOutputTokens ?? null,
      version: 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
    } satisfies ModelEntity);
  }

  /** PUT: every editable field is replaced. True when something changed. */
  update(entity: ModelEntity, dto: UpdateModelRequest): boolean {
    const next = {
      name: dto.name,
      status: dto.status,
      contextWindow: dto.contextWindow,
      maxOutputTokens: dto.maxOutputTokens,
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).some(
      (key) => entity[key] !== next[key],
    );
    Object.assign(entity, next);
    return changed;
  }

  toPriceEntity(
    modelId: string,
    price: ApiTypes.ModelPriceInput,
    effectiveFrom: Date,
    createdBy: string,
    now: Date,
  ): ModelPriceEntity {
    return Object.assign(new ModelPriceEntity(), {
      id: uuidv7(),
      modelId,
      effectiveFrom,
      inputPerMTok: decimal(price.inputPerMTok),
      outputPerMTok: decimal(price.outputPerMTok),
      cacheReadPerMTok: optionalDecimal(price.cacheReadPerMTok),
      cacheWritePerMTok: optionalDecimal(price.cacheWritePerMTok),
      longContext: price.longContext
        ? {
            aboveInputTokens: price.longContext.aboveInputTokens,
            inputPerMTok: decimal(price.longContext.inputPerMTok),
            outputPerMTok: decimal(price.longContext.outputPerMTok),
            cacheReadPerMTok: optionalDecimal(
              price.longContext.cacheReadPerMTok,
            ),
            cacheWritePerMTok: optionalDecimal(
              price.longContext.cacheWritePerMTok,
            ),
          }
        : null,
      createdBy,
      createdAt: now,
    } satisfies ModelPriceEntity);
  }

  toResponse(
    entity: ModelEntity,
    price: ModelPriceEntity | null,
  ): ModelResponse {
    return {
      id: entity.id,
      provider: entity.provider,
      model: entity.model,
      name: entity.name,
      status: entity.status,
      contextWindow: entity.contextWindow,
      maxOutputTokens: entity.maxOutputTokens,
      price: price ? this.toPriceResponse(price) : null,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  toPriceResponse(entity: ModelPriceEntity): ModelPriceResponse {
    return {
      id: entity.id,
      modelId: entity.modelId,
      effectiveFrom: entity.effectiveFrom.toISOString(),
      // Postgres returns numeric(12,6) as "2.000000": the same form.
      inputPerMTok: decimal(entity.inputPerMTok),
      outputPerMTok: decimal(entity.outputPerMTok),
      cacheReadPerMTok: optionalDecimal(entity.cacheReadPerMTok),
      cacheWritePerMTok: optionalDecimal(entity.cacheWritePerMTok),
      longContext: entity.longContext,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}

/** Prices always have 6 decimals (`"2.500000"`), as Postgres returns them. */
const decimal = (value: string) => fromMicros(toMicros(value));
const optionalDecimal = (value: string | null | undefined) =>
  value === null || value === undefined ? null : decimal(value);
