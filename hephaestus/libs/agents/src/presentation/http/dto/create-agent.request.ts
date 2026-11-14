import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import type { ApiSchema } from '@hephaestus/core';

export class CreateAgentRequest implements ApiSchema<'CreateAgentRequest'> {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(2000)
  description: string;

  // TODO: take from the authenticated user once auth exists.
  @IsString()
  @IsNotEmpty()
  createdBy: string;
}
