import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { PageRequest } from '../pagination/page.js';

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

/** `?limit=&cursor=` query parameters, validated and defaulted. */
export class PaginationQuery implements PageRequest {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = DEFAULT_PAGE_LIMIT;

  /** Opaque; from the previous page's `nextCursor`. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  cursor?: string;
}
