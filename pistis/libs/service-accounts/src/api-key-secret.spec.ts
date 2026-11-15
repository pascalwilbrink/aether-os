import { hashApiKey, looksLikeApiKey, newApiKey } from './api-key-secret.js';

describe('API keys', () => {
  it('are 256 random bits behind a recognisable prefix, stored as a hash', () => {
    const a = newApiKey();
    const b = newApiKey();
    expect(a.key).toMatch(/^aos_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 12));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.key.slice(4));
  });

  it('rejects anything that is not shaped like one before any lookup', () => {
    expect(looksLikeApiKey(newApiKey().key)).toBe(true);
    expect(looksLikeApiKey('aos_short')).toBe(false);
    expect(looksLikeApiKey('Bearer xyz')).toBe(false);
    expect(looksLikeApiKey('')).toBe(false);
  });
});
