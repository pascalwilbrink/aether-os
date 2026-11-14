import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import type {
  AgentModelConfiguration,
  AgentRuntimeConfiguration,
  AgentSkillConfiguration,
  AgentToolConfiguration,
} from '../../../domain/agent-version.js';

import type { ApiSchema } from '@hephaestus/core';

export class AgentModelConfigurationDto
  implements AgentModelConfiguration, ApiSchema<'AgentModelConfiguration'>
{
  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsString()
  @IsNotEmpty()
  model: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTokens?: number;
}

export class AgentToolConfigurationDto
  implements AgentToolConfiguration, ApiSchema<'AgentToolConfiguration'>
{
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}

export class AgentSkillConfigurationDto
  implements AgentSkillConfiguration, ApiSchema<'AgentSkillConfiguration'>
{
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  version: string;

  @IsBoolean()
  enabled: boolean;
}

export class AgentRuntimeConfigurationDto
  implements AgentRuntimeConfiguration, ApiSchema<'AgentRuntimeConfiguration'>
{
  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsIn(['standard', 'coding'])
  executionMode: 'standard' | 'coding';

  @IsBoolean()
  sandboxRequired: boolean;
}

export class CreateAgentVersionRequest implements ApiSchema<'CreateAgentVersionRequest'> {
  @IsString()
  @IsNotEmpty()
  instructions: string;

  @ValidateNested()
  @Type(() => AgentModelConfigurationDto)
  model: AgentModelConfigurationDto;

  @IsArray()
  @IsString({ each: true })
  capabilities: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentToolConfigurationDto)
  tools: AgentToolConfigurationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentSkillConfigurationDto)
  skills: AgentSkillConfigurationDto[];

  @ValidateNested()
  @Type(() => AgentRuntimeConfigurationDto)
  runtime: AgentRuntimeConfigurationDto;

  // TODO: take from the authenticated user once auth exists.
  @IsString()
  @IsNotEmpty()
  createdBy: string;
}
