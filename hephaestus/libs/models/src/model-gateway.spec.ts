import type { ConfigService } from '@nestjs/config';

import type { Env } from '@hephaestus/core';

import {
  FakeSecretStore,
  ScriptedLanguageModels,
} from '../../../test/fake-models.js';
import { ModelGateway, type ModelCallContext } from './model-gateway.js';
import { ModelKeyMissingError } from './model.errors.js';

const context: ModelCallContext = {
  organizationId: 'org-1',
  projectId: 'project-1',
  taskId: 'task-1',
  executionId: 'execution-1',
  agentVersionId: 'version-1',
};
const model = { provider: 'anthropic', model: 'claude-sonnet' };

describe('ModelGateway keys', () => {
  let secrets: FakeSecretStore;
  let models: ScriptedLanguageModels;

  const gateway = (platformKeys: boolean) =>
    new ModelGateway(null as never, secrets, models, {
      get: (key: keyof Env) =>
        key === 'PLATFORM_MODEL_KEYS' ? platformKeys : undefined,
    } as unknown as ConfigService<Env, true>);

  beforeEach(() => {
    secrets = new FakeSecretStore();
    models = new ScriptedLanguageModels();
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
});
