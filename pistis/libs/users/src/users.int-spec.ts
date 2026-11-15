import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

import { createTestingModule } from '../../../test/testing-module.js';
import { AccountsService, type SignInIdentity } from './accounts.service.js';
import { UserProvidersService } from './user-providers.service.js';
import { UsersModule } from './users.module.js';
import { UsersService } from './users.service.js';

const google = (
  subject: string,
  email: string | null = 'ada@example.com',
): SignInIdentity => ({
  provider: 'google',
  subject,
  email,
  emailVerified: true,
  displayName: 'Ada',
});

describe('Users and their identities (Postgres)', () => {
  let moduleRef: TestingModule;
  let accounts: AccountsService;
  let users: UsersService;
  let providers: UserProvidersService;

  beforeEach(async () => {
    moduleRef = await createTestingModule(UsersModule);
    accounts = moduleRef.get(AccountsService);
    users = moduleRef.get(UsersService);
    providers = moduleRef.get(UserProvidersService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('creates a user on the first sign-in, and finds them on the next', async () => {
    const first = await accounts.resolveSignIn(google('g-1'));
    expect(first).toMatchObject({
      created: true,
      user: { displayName: 'Ada', email: 'ada@example.com', status: 'active' },
    });
    expect(first.user.lastSignInAt).not.toBeNull();

    const again = await accounts.resolveSignIn(google('g-1'));
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(first.user.id);
  });

  it('signs in through any linked provider as the same user', async () => {
    const { user } = await accounts.resolveSignIn(google('g-1'));
    await providers.link(user.id, {
      provider: 'github',
      subject: '42',
      email: 'ada@users.noreply.github.com',
      emailVerified: true,
    });

    const viaGithub = await accounts.resolveSignIn({
      provider: 'github',
      subject: '42',
      email: null,
      emailVerified: false,
      displayName: 'ada-l',
    });

    expect(viaGithub).toMatchObject({ created: false, user: { id: user.id } });
    const linked = await providers.list(user.id, { limit: 10 });
    expect(linked.items.map((p) => p.provider)).toEqual(['google', 'github']);
    // The provider's latest report of the email is kept on the link.
    expect(linked.items[1]).toMatchObject({
      email: null,
      lastSignInAt: expect.any(String),
    });
  });

  it('never links accounts by email address', async () => {
    const { user } = await accounts.resolveSignIn(
      google('g-1', 'ada@example.com'),
    );

    const other = await accounts.resolveSignIn({
      provider: 'github',
      subject: '42',
      email: 'ada@example.com',
      emailVerified: true,
      displayName: 'Someone',
    });

    expect(other.created).toBe(true);
    expect(other.user.id).not.toBe(user.id);
  });

  it('keeps an identity to one user', async () => {
    const ada = await accounts.resolveSignIn(google('g-1'));
    const bob = await accounts.resolveSignIn(google('g-2', 'bob@example.com'));

    await expect(
      providers.link(bob.user.id, {
        provider: 'google',
        subject: 'g-1',
        email: null,
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_ALREADY_LINKED' });
    expect((await accounts.resolveSignIn(google('g-1'))).user.id).toBe(
      ada.user.id,
    );
  });

  it('creates one user when the same first sign-in happens twice at once', async () => {
    const results = await Promise.all([
      accounts.resolveSignIn(google('g-race')),
      accounts.resolveSignIn(google('g-race')),
      accounts.resolveSignIn(google('g-race')),
    ]);

    expect(new Set(results.map((r) => r.user.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect((await users.list({ limit: 10 })).items).toHaveLength(1);
  });

  it('refuses sign-in for a disabled user until enabled again', async () => {
    const { user } = await accounts.resolveSignIn(google('g-1'));

    await users.disable(user.id);
    await expect(accounts.resolveSignIn(google('g-1'))).rejects.toMatchObject({
      code: 'USER_DISABLED',
    });

    await users.enable(user.id);
    await expect(accounts.resolveSignIn(google('g-1'))).resolves.toMatchObject({
      created: false,
    });
  });

  it('unlinks identities, but never the last one', async () => {
    const user = await accounts.createUser({
      displayName: 'Ada',
      email: null,
      provider: {
        provider: 'google',
        subject: 'g-1',
        email: null,
        emailVerified: false,
      },
    });
    const github = await providers.link(user.id, {
      provider: 'github',
      subject: '42',
      email: null,
      emailVerified: false,
    });
    const [google1] = (await providers.list(user.id, { limit: 10 })).items;

    await providers.unlink(user.id, google1.id);
    await expect(providers.unlink(user.id, github.id)).rejects.toMatchObject({
      code: 'USER_LAST_PROVIDER',
    });

    // The unlinked identity is free again: signing in with it is a new user.
    const fresh = await accounts.resolveSignIn(google('g-1'));
    expect(fresh.created).toBe(true);
  });

  it('keeps two concurrent unlinks from removing both identities', async () => {
    const user = await accounts.createUser({
      displayName: 'Ada',
      email: null,
      provider: {
        provider: 'google',
        subject: 'g-1',
        email: null,
        emailVerified: false,
      },
    });
    await providers.link(user.id, {
      provider: 'github',
      subject: '42',
      email: null,
      emailVerified: false,
    });
    const ids = (await providers.list(user.id, { limit: 10 })).items.map(
      (p) => p.id,
    );

    const results = await Promise.allSettled(
      ids.map((id) => providers.unlink(user.id, id)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await providers.list(user.id, { limit: 10 })).items).toHaveLength(
      1,
    );
  });

  it('404s for unknown users', async () => {
    const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

    await expect(users.findById(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      providers.link(missing, {
        provider: 'github',
        subject: '1',
        email: null,
        emailVerified: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
