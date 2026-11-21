import { z } from 'zod';

import { createZodDto, zListRepositoryFilesQuery } from '@proxenos/core';

/** `?path=` once arrives as a string, more than once as an array. */
export class ListRepositoryFilesQuery extends createZodDto(
  z.object({
    path: z.preprocess(
      (value) => (typeof value === 'string' ? [value] : value),
      zListRepositoryFilesQuery.shape.path,
    ),
  }),
) {}
