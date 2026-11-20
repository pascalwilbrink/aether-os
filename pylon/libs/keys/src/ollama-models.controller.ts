import { Controller, Get, Param } from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@pylon/core';

import {
  OllamaModelList,
  OllamaModelsParams,
} from './dto/ollama-models.dto.js';
import { OllamaModelsService } from './ollama-models.service.js';

/** What the organization's Ollama server offers. */
@Controller('organizations/:organizationId/ollama/models')
export class OllamaModelsController {
  constructor(private readonly ollama: OllamaModelsService) {}

  @Get()
  @RequirePermission('agent:read')
  @ZodSerializerDto(OllamaModelList)
  list(@Param() { organizationId }: OllamaModelsParams) {
    return this.ollama.list(organizationId);
  }
}
