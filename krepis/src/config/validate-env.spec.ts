import { z } from 'zod';

import { validateEnv } from './validate-env.js';

const validate = validateEnv(
  z.object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().default(3001),
  }),
);

describe('validateEnv', () => {
  it('returns parsed, defaulted values', () => {
    expect(validate({ DATABASE_URL: 'postgres://h/db', OTHER: 'x' })).toEqual({
      DATABASE_URL: 'postgres://h/db',
      PORT: 3001,
    });
  });

  it('names every invalid variable without echoing values', () => {
    expect(() =>
      validate({ DATABASE_URL: 'secret-but-not-a-url', PORT: 'x' }),
    ).toThrow(/DATABASE_URL[\s\S]*PORT/);
    expect(() =>
      validate({ DATABASE_URL: 'secret-but-not-a-url' }),
    ).not.toThrow(/secret-but-not-a-url/);
  });
});
