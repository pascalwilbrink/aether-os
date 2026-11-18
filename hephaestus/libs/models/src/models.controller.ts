import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';

import {
  Authenticated,
  PlatformAccess,
  ZodSerializerDto,
} from '@hephaestus/core';

import { AddModelPriceRequest } from './dto/add-model-price.request.js';
import { CreateModelRequest } from './dto/create-model.request.js';
import { ListModelPricesQuery } from './dto/list-model-prices.query.js';
import { ListModelsQuery } from './dto/list-models.query.js';
import { ModelPage } from './dto/model-page.response.js';
import { ModelPricePage } from './dto/model-price-page.response.js';
import { ModelPriceResponse } from './dto/model-price.response.js';
import { ModelParams } from './dto/model.params.js';
import { ModelResponse } from './dto/model.response.js';
import { UpdateModelRequest } from './dto/update-model.request.js';
import { ModelCatalogService } from './model-catalog.service.js';

/**
 * The model catalogue: the platform's, not an organization's. Any valid
 * token reads it; changing it is for platform services with
 * `platform:manage` (`@PlatformAccess` alone refuses organization tokens).
 */
@Controller('models')
export class ModelsController {
  constructor(private readonly catalog: ModelCatalogService) {}

  @Get()
  @Authenticated()
  @ZodSerializerDto(ModelPage)
  list(@Query() { status, provider, ...page }: ListModelsQuery) {
    return this.catalog.list({ status, provider }, page);
  }

  @Post()
  @PlatformAccess('platform:manage')
  @ZodSerializerDto(ModelResponse)
  create(@Body() body: CreateModelRequest) {
    return this.catalog.create(body);
  }

  @Get(':modelId')
  @Authenticated()
  @ZodSerializerDto(ModelResponse)
  findById(@Param() { modelId }: ModelParams) {
    return this.catalog.findById(modelId);
  }

  @Put(':modelId')
  @PlatformAccess('platform:manage')
  @ZodSerializerDto(ModelResponse)
  update(@Param() { modelId }: ModelParams, @Body() body: UpdateModelRequest) {
    return this.catalog.update(modelId, body);
  }

  @Get(':modelId/prices')
  @Authenticated()
  @ZodSerializerDto(ModelPricePage)
  listPrices(
    @Param() { modelId }: ModelParams,
    @Query() query: ListModelPricesQuery,
  ) {
    return this.catalog.listPrices(modelId, query);
  }

  @Post(':modelId/prices')
  @PlatformAccess('platform:manage')
  @ZodSerializerDto(ModelPriceResponse)
  addPrice(
    @Param() { modelId }: ModelParams,
    @Body() body: AddModelPriceRequest,
  ) {
    return this.catalog.addPrice(modelId, body);
  }
}
