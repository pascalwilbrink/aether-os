import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  isSelfHosted,
  ModelEndpointUnavailableError,
  ModelKeyMissingError,
} from '@pylon/catalog';
import { SecretStore, type Env } from '@pylon/core';

import {
  checkModelKeySettings,
  type ModelKeySettings,
} from './model-key-settings.js';
import { modelKeyPath } from './model-keys.service.js';

/** Whose provider account pays for a call. */
export type KeySource = 'agent' | 'organization' | 'platform';

export interface ProviderKey {
  settings: ModelKeySettings;
  source: KeySource;
}

/** A provider name that's safe in a secret path (`anthropic`, `openai`, …). */
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The key a call uses (docs/models.md, Keys): the agent's own, else the
 * organization's, else, with `PLATFORM_MODEL_KEYS`, the platform's, read
 * from OpenBao every call (keys can change any time). Throws
 * `ModelKeyMissingError` when there's none, `SecretStoreUnavailableError`
 * when OpenBao can't answer, and `ModelEndpointUnavailableError` for an
 * Ollama server Pylon won't call (the rules may have changed since it was
 * set). Keys never leave Pylon's process except to their provider.
 */
@Injectable()
export class ProviderKeys {
  constructor(
    private readonly secrets: SecretStore,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async keyFor(
    organizationId: string,
    provider: string,
    agentId: string | null,
  ): Promise<ProviderKey> {
    if (!PROVIDER.test(provider)) {
      throw new ModelKeyMissingError(provider);
    }
    const key = await this.find(organizationId, provider, agentId);
    if (key.settings.baseUrl) {
      const checked = checkModelKeySettings(provider, key.settings, {
        allowPrivate: this.config.get('MODEL_ENDPOINT_ALLOW_PRIVATE', {
          infer: true,
        }),
      });
      if ('problem' in checked) {
        throw new ModelEndpointUnavailableError(checked.problem);
      }
    }
    return key;
  }

  private async find(
    organizationId: string,
    provider: string,
    agentId: string | null,
  ): Promise<ProviderKey> {
    if (agentId) {
      const agents = settingsOf(
        provider,
        await this.secrets.read(
          modelKeyPath(organizationId, provider, agentId),
        ),
      );
      if (agents) {
        return { settings: agents, source: 'agent' };
      }
    }
    const own = settingsOf(
      provider,
      await this.secrets.read(modelKeyPath(organizationId, provider)),
    );
    if (own) {
      return { settings: own, source: 'organization' };
    }
    if (this.config.get('PLATFORM_MODEL_KEYS', { infer: true })) {
      const platform = settingsOf(
        provider,
        await this.secrets.read(`platform/llm/${provider}`),
      );
      if (platform) {
        return { settings: platform, source: 'platform' };
      }
    }
    throw new ModelKeyMissingError(provider);
  }
}

/**
 * A provider's stored settings (`{ apiKey }`; for Ollama `{ baseUrl,
 * apiKey? }`), or null when there are none to use.
 */
function settingsOf(
  provider: string,
  secret: Record<string, unknown> | null,
): ModelKeySettings | null {
  const text = (name: string) => {
    const value = secret?.[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  const apiKey = text('apiKey');
  if (isSelfHosted(provider)) {
    const baseUrl = text('baseUrl');
    return baseUrl ? { baseUrl, ...(apiKey ? { apiKey } : {}) } : null;
  }
  return apiKey ? { apiKey } : null;
}
