import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher({ cost: 14 });

  it('verifies the password it hashed, and nothing else', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(hash).toMatch(/^scrypt\$14\$8\$1\$[\w-]+\$[\w-]+$/);
    await expect(
      hasher.verify('correct horse battery staple', hash),
    ).resolves.toBe(true);
    await expect(
      hasher.verify('correct horse battery stapl', hash),
    ).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('same password!'),
      hasher.hash('same password!'),
    ]);
    expect(a).not.toBe(b);
  });

  it('treats equivalent Unicode spellings as the same password (NFKC)', async () => {
    const hash = await hasher.hash('café au lait 123');
    await expect(hasher.verify('café au lait 123', hash)).resolves.toBe(true);
  });

  it('verifies hashes made with another cost, so the cost can be raised', async () => {
    const old = await new PasswordHasher({ cost: 15 }).hash(
      'an older password',
    );
    await expect(hasher.verify('an older password', old)).resolves.toBe(true);
  });

  it('rejects malformed hashes instead of throwing', async () => {
    await expect(hasher.verify('anything', 'bcrypt$whatever')).resolves.toBe(
      false,
    );
  });
});
