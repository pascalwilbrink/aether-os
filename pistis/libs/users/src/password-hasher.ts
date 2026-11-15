import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

export const PASSWORD_HASHER_OPTIONS = Symbol('PASSWORD_HASHER_OPTIONS');

export interface PasswordHasherOptions {
  /** log2 of scrypt's N for new hashes. */
  cost: number;
}

const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function scrypt(
  password: string,
  salt: Buffer,
  cost: number,
  r: number,
  p: number,
): Promise<Buffer> {
  const N = 2 ** cost;
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((resolve, reject) =>
    scryptCallback(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      options,
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

/**
 * Password hashing with scrypt from Node's standard library (no native
 * dependency): OWASP's parameters by default (N = 2^17, r = 8, p = 1), the
 * parameters stored with each hash so they can be raised without breaking
 * existing ones, and constant-time comparison.
 */
@Injectable()
export class PasswordHasher {
  private dummy: Promise<string> | undefined;

  constructor(
    @Inject(PASSWORD_HASHER_OPTIONS)
    private readonly options: PasswordHasherOptions,
  ) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, this.options.cost, R, P);

    return [
      'scrypt',
      this.options.cost,
      R,
      P,
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, cost, r, p, salt, key] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !key) {
      return false;
    }
    const expected = Buffer.from(key, 'base64url');
    const actual = await scrypt(
      password,
      Buffer.from(salt, 'base64url'),
      Number(cost),
      Number(r),
      Number(p),
    );

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  /**
   * Spends the same time as verifying a real password, for logins that
   * don't exist, so response times don't reveal which logins do.
   */
  async verifyNothing(password: string): Promise<void> {
    this.dummy ??= this.hash('not a real password');
    await this.verify(password, await this.dummy);
  }
}
