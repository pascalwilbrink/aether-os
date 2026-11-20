import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  guardedFetch,
  SecretStore,
  type ApiTypes,
  type Env,
} from '@hephaestus/core';
import { OrganizationsService } from '@hephaestus/tenancy';

import { checkModelKeySettings } from './model-key-settings.js';
import { modelKeyPath } from './model-keys.service.js';
import { ModelKeyInvalidError } from './model.errors.js';

/** How long the Ollama server gets to answer. */
const TIMEOUT_MS = 10_000;

/**
 * The models an organization's Ollama server has (`GET <baseUrl>/api/tags`),
 * to choose from for an agent version: asked with the organization's
 * settings, through `guardedFetch`.
 */
@Injectable()
export class OllamaModelsService {
  constructor(
    private readonly secrets: SecretStore,
    private readonly organizations: OrganizationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(organizationId: string): Promise<ApiTypes.OllamaModelList> {
    await this.organizations.assertExists(organizationId);
    const stored = await this.secrets.read(
      modelKeyPath(organizationId, 'ollama'),
    );
    const allowPrivate = this.config.get('MODEL_ENDPOINT_ALLOW_PRIVATE', {
      infer: true,
    });
    const settings = checkModelKeySettings(
      'ollama',
      {
        baseUrl: typeof stored?.baseUrl === 'string' ? stored.baseUrl : '',
        apiKey: typeof stored?.apiKey === 'string' ? stored.apiKey : undefined,
      },
      { allowPrivate },
    );
    if (!stored || 'problem' in settings) {
      throw new ModelKeyInvalidError(
        stored && 'problem' in settings
          ? settings.problem
          : "The organization hasn't set an Ollama server.",
      );
    }
    let body: unknown;
    try {
      const response = await guardedFetch(allowPrivate)(
        `${settings.baseUrl}/api/tags`,
        {
          headers: settings.apiKey
            ? { Authorization: `Bearer ${settings.apiKey}` }
            : {},
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`it answered ${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      throw new ServiceUnavailableException(
        `The Ollama server at ${settings.baseUrl} didn't answer: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const models = (body as { models?: unknown } | null)?.models;
    const items = (Array.isArray(models) ? models : [])
      .map((model: unknown) => {
        const entry = model as { name?: unknown; size?: unknown };
        return typeof entry.name === 'string'
          ? {
              name: entry.name,
              sizeBytes:
                typeof entry.size === 'number' && entry.size >= 0
                  ? Math.round(entry.size)
                  : null,
            }
          : null;
      })
      .filter((model) => model !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { items };
  }
}
