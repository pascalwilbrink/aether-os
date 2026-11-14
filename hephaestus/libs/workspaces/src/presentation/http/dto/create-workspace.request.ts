import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Matches,
  ValidateNested,
} from 'class-validator';

import type {
  RepositoryConfiguration,
  SandboxConfiguration,
} from '../../../domain/workspace.js';

import type { ApiSchema } from '@hephaestus/core';

export class RepositoryConfigurationDto
  implements RepositoryConfiguration, ApiSchema<'RepositoryConfiguration'>
{
  @IsIn(['github', 'gitlab', 'bitbucket'])
  provider: 'github' | 'gitlab' | 'bitbucket';

  @IsUrl({ protocols: ['https'], require_protocol: true })
  repositoryUrl: string;

  @IsString()
  @IsNotEmpty()
  branch: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{7,40}$/, {
    message: 'commitSha must be a 7–40 character lowercase hex SHA',
  })
  commitSha?: string;
}

export class SandboxConfigurationDto
  implements SandboxConfiguration, ApiSchema<'SandboxConfiguration'>
{
  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsString()
  @IsNotEmpty()
  image: string;

  @IsNumber()
  @IsPositive()
  cpuLimit: number;

  @IsInt()
  @IsPositive()
  memoryLimitMb: number;

  @IsIn(['none', 'restricted', 'full'])
  networkAccess: 'none' | 'restricted' | 'full';
}

// expiresAt is an ISO string on the wire; class-transformer turns it into a Date.
export class CreateWorkspaceRequest implements Omit<
  ApiSchema<'CreateWorkspaceRequest'>,
  'expiresAt'
> {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  executionId: string;

  @ValidateNested()
  @Type(() => RepositoryConfigurationDto)
  repository: RepositoryConfigurationDto;

  @ValidateNested()
  @Type(() => SandboxConfigurationDto)
  sandbox: SandboxConfigurationDto;

  @Matches(/^\//, { message: 'workingDirectory must be an absolute path' })
  workingDirectory: string;

  /** ISO 8601 timestamp; must be in the future. */
  @Type(() => Date)
  @IsDate()
  expiresAt: Date;
}
