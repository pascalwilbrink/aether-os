import type { ConfigService } from '@nestjs/config';

import type { Env } from '@hephaestus/core';

import {
  FakeSecretStore,
  ScriptedLanguageModels,
} from '../../../test/fake-models.js';
import type {
  CatalogEntry,
  ModelCatalogService,
} from './model-catalog.service.js';
import { ModelGateway, type ModelCallContext } from './model-gateway.js';
import { ModelKeyMissingError, ModelRetiredError } from './model.errors.js';

const context: ModelCallContext = {
  organizationId: 'org-1',
  projectId: 'project-1',
  taskId: 'task-1',
  topLevelTaskId: 'task-1',
  executionId: 'execution-1',
  agentVersionId: 'version-1',
};
const model = { provider: 'anthropic', model: 'claude-sonnet' };

describe('ModelGateway keys', () => {
  let secrets: FakeSecretStore;
  let models: ScriptedLanguageModels;
  let entry: CatalogEntry | null;

  const gateway = (platformKeys: boolean) =>
    new ModelGateway(
      null as never,
      secrets,
      models,
      {
        get: (key: keyof Env) =>
          key === 'PLATFORM_MODEL_KEYS' ? platformKeys : undefined,
      } as unknown as ConfigService<Env, true>,
      {
        entryFor: () => Promise.resolve(entry),
      } as unknown as ModelCatalogService,
    );

  beforeEach(() => {
    secrets = new FakeSecretStore();
    models = new ScriptedLanguageModels();
    entry = null;
    secrets.secrets.set('platform/llm/anthropic', { apiKey: 'platform-key' });
  });

  it("uses the organization's own key first", async () => {
    secrets.secrets.set('orgs/org-1/llm/anthropic', { apiKey: 'own-key' });

    const resolved = await gateway(true).resolve(context, model);

    expect(resolved).toMatchObject({
      provider: 'anthropic',
      modelId: 'claude-sonnet',
      keySource: 'organization',
    });
    expect(models.created).toEqual([
      { id: 'anthropic/claude-sonnet', apiKey: 'own-key' },
    ]);
  });

  it("uses the platform's key only when allowed", async () => {
    await expect(gateway(true).resolve(context, model)).resolves.toMatchObject({
      keySource: 'platform',
    });
    expect(models.created).toEqual([
      { id: 'anthropic/claude-sonnet', apiKey: 'platform-key' },
    ]);

    await expect(gateway(false).resolve(context, model)).rejects.toBeInstanceOf(
      ModelKeyMissingError,
    );
  });

  it('never reads a path built from an unsafe provider name', async () => {
    await expect(
      gateway(true).resolve(context, { provider: '../platform', model: 'x' }),
    ).rejects.toBeInstanceOf(ModelKeyMissingError);
    expect(secrets.reads).toEqual([]);
  });

  it("resolves with the catalogue's current price", async () => {
    const price = {
      id: 'price-1',
      inputPerMTok: '2.000000',
      outputPerMTok: '10.000000',
      cacheReadPerMTok: null,
      cacheWritePerMTok: null,
      longContext: null,
    };
    entry = { status: 'deprecated', price };

    await expect(gateway(true).resolve(context, model)).resolves.toMatchObject({
      price,
    });
  });

  it('refuses a retired model before reading any key', async () => {
    entry = { status: 'retired', price: null };

    await expect(gateway(true).resolve(context, model)).rejects.toBeInstanceOf(
      ModelRetiredError,
    );
    expect(secrets.reads).toEqual([]);
  });
});
