import type { z } from 'zod';

/** A class made with `createZodDto(schema)`. */
export interface ZodDtoClass {
  readonly isZodDto: true;
  readonly schema: z.ZodType;
}

/** True for classes made with `createZodDto`, which set a static `isZodDto`. */
export function isZodDtoClass(metatype: unknown): metatype is ZodDtoClass {
  return (
    typeof metatype === 'function' &&
    (metatype as Partial<ZodDtoClass>).isZodDto === true &&
    (metatype as Partial<ZodDtoClass>).schema !== undefined
  );
}
