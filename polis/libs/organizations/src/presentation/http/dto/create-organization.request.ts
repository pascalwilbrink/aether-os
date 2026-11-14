import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import type { ApiSchema } from '@polis/core';

export class CreateOrganizationRequest implements ApiSchema<'CreateOrganizationRequest'> {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  /** URL-safe identifier: lowercase letters, digits and single hyphens. */
  @IsString()
  @Length(3, 63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain only lowercase letters, digits and single hyphens, and must not start or end with a hyphen',
  })
  slug: string;

  // TODO: take from the authenticated user once auth exists.
  @IsString()
  @IsNotEmpty()
  createdBy: string;
}
