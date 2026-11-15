import { createHash, randomBytes } from 'node:crypto';

/** API keys look like `aos_<43 base64url characters>` (256 random bits). */
export const API_KEY_PREFIX = 'aos_';
const KEY = /^aos_[A-Za-z0-9_-]{43}$/;

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Whether a string can be an API key at all (before any lookup). */
export function looksLikeApiKey(value: string): boolean {
  return KEY.test(value);
}
