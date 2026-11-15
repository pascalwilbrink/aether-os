import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

import { ValidationProblemException } from '@pistis/core';

import { createTestingModule } from '../../../test/testing-module.js';
import { AccountsService } from './accounts.service.js';
import { PasswordsService } from './passwords.service.js';
import { UserProvidersService } from './user-providers.service.js';
import {
  IdentityAlreadyLinkedError,
  InvalidCredentialsError,
  PasswordAlreadySetError,
  PasswordProviderReservedError,
  UserDisabledError,
} from './users.errors.js';
import { UsersModule } from './users.module.js';
import { UsersService } from './users.service.js';

const PASSWORD = 'a long enough password';

describe('Passwords (Postgres)', () => {
  let moduleRef: TestingModule;
  let accounts: AccountsService;
  let passwords: PasswordsService;
  let providers: UserProvidersService;
  let users: UsersService;

  beforeEach(async () => {
    moduleRef = await createTestingModule(UsersModule);
    accounts = moduleRef.get(AccountsService);
    passwords = moduleRef.get(PasswordsService);
    providers = moduleRef.get(UserProvidersService);
    users = moduleRef.get(UsersService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const createAda = () =>
    accounts.createUser({
      displayName: 'Ada',
      email: 'ada@example.com',
      password: { login: ' Ada@Example.com ', password: PASSWORD },
    });

  it('creates a user with a password identity and signs them in', async () => {
    const user = await createAda();

    const identities = await providers.list(user.id, { limit: 20 });
    expect(identities.items).toEqual([
      expect.objectContaining({
        provider: 'password',
        subject: 'ada@example.com',
      }),
    ]);

    const signedIn = await accounts.signInWithPassword(
      'ADA@example.com',
      PASSWORD,
    );
    expect(signedIn.id).toBe(user.id);
    expect(signedIn.lastSignInAt).not.toBeNull();
  });

  it('rejects a wrong password and an unknown login alike', async () => {
    await createAda();

    await expect(
      accounts.signInWithPassword('ada@example.com', 'wrong password!!'),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      accounts.signInWithPassword('nobody@example.com', PASSWORD),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('refuses disabled users', async () => {
    const user = await createAda();
    await users.disable(user.id);

    await expect(
      accounts.signInWithPassword('ada@example.com', PASSWORD),
    ).rejects.toThrow(UserDisabledError);
  });

  it('changes the password', async () => {
    const user = await createAda();
    await passwords.change(user.id, { password: 'a brand new password' });

    await expect(
      accounts.signInWithPassword('ada@example.com', PASSWORD),
    ).rejects.toThrow(InvalidCredentialsError);
    await expect(
      accounts.signInWithPassword('ada@example.com', 'a brand new password'),
    ).resolves.toMatchObject({ id: user.id });
  });

  it('adds a password to a user who signs in elsewhere, once', async () => {
    const { user } = await accounts.resolveSignIn({
      provider: 'google',
      subject: 'g-1',
      email: 'ada@example.com',
      emailVerified: true,
      displayName: 'Ada',
    });
    await expect(
      passwords.change(user.id, { password: PASSWORD }),
    ).rejects.toThrow(NotFoundException);

    await passwords.setUp(user.id, { login: 'ada', password: PASSWORD });
    await expect(
      accounts.signInWithPassword('ada', PASSWORD),
    ).resolves.toMatchObject({
      id: user.id,
    });
    await expect(
      passwords.setUp(user.id, { login: 'ada2', password: PASSWORD }),
    ).rejects.toThrow(PasswordAlreadySetError);
  });

  it('keeps logins unique across users', async () => {
    await createAda();
    const other = await accounts.createUser({
      displayName: 'Grace',
      email: 'grace@example.com',
      provider: {
        provider: 'google',
        subject: 'g-2',
        email: null,
        emailVerified: false,
      },
    });

    await expect(
      passwords.setUp(other.id, {
        login: 'ada@example.com',
        password: PASSWORD,
      }),
    ).rejects.toThrow(IdentityAlreadyLinkedError);
  });

  it('only links the password provider through a password', async () => {
    const user = await createAda();

    await expect(
      providers.link(user.id, {
        provider: 'password',
        subject: 'someone',
        email: null,
        emailVerified: false,
      }),
    ).rejects.toThrow(PasswordProviderReservedError);
  });

  it('creates users with exactly one first identity', async () => {
    await expect(
      accounts.createUser({
        displayName: 'Nobody',
        email: 'nobody@example.com',
      }),
    ).rejects.toThrow(ValidationProblemException);
    await expect(
      accounts.createUser({
        displayName: 'Both',
        email: 'both@example.com',
        provider: {
          provider: 'google',
          subject: 'g-3',
          email: null,
          emailVerified: false,
        },
        password: { login: 'both', password: PASSWORD },
      }),
    ).rejects.toThrow(ValidationProblemException);
  });
});
