import type { ModelKeySettings } from '@pylon/keys';

/** The request and answer formats Pylon reads usage from. */
export type ApiFormat =
  'anthropic-messages' | 'openai-chat' | 'openai-responses' | 'google-generate';

/** Where the hosted providers' APIs are (`*_API_URL`). */
export interface ProviderUrls {
  anthropic: string;
  openai: string;
  mistral: string;
  google: string;
}

/** A pass-through call Pylon recognised: what to check, and how to read it. */
export interface ProviderCall {
  provider: string;
  format: ApiFormat;
  model: string;
  stream: boolean;
  /** The request to send on, adjusted (OpenAI: usage in streams). */
  body: Record<string, unknown>;
}

/** What goes to the provider. */
export interface UpstreamRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const GOOGLE =
  /^v1beta\/models\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127}):(generateContent|streamGenerateContent)$/;

/** The routes each provider passes through, below `/v1/providers/<provider>/`. */
const ROUTES: Record<string, Record<string, ApiFormat>> = {
  anthropic: { 'v1/messages': 'anthropic-messages' },
  openai: {
    'v1/chat/completions': 'openai-chat',
    'v1/responses': 'openai-responses',
  },
  mistral: { 'v1/chat/completions': 'openai-chat' },
  ollama: { 'v1/chat/completions': 'openai-chat' },
};

/** Request headers passed on as they came (besides the key Pylon sets). */
const FORWARDED: Record<string, readonly string[]> = {
  anthropic: ['anthropic-version', 'anthropic-beta'],
  openai: ['openai-beta'],
  mistral: [],
  ollama: [],
  google: [],
};

/**
 * Recognises a pass-through call (`/v1/providers/<provider>/<path>`), or
 * returns why Pylon won't pass it on.
 */
export function providerCall(
  provider: string,
  path: string,
  body: unknown,
): ProviderCall | { problem: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { problem: 'The request body must be a JSON object.' };
  }
  const request = { ...(body as Record<string, unknown>) };
  if (provider === 'google') {
    const match = GOOGLE.exec(path);
    if (!match) {
      return { problem: `Pylon doesn't pass on google/${path}.` };
    }
    return {
      provider,
      format: 'google-generate',
      model: match[1],
      stream: match[2] === 'streamGenerateContent',
      body: request,
    };
  }
  const format = ROUTES[provider]?.[path];
  if (!format) {
    return { problem: `Pylon doesn't pass on ${provider}/${path}.` };
  }
  const model = request.model;
  if (typeof model !== 'string' || !MODEL.test(model)) {
    return { problem: 'The request needs its model.' };
  }
  const stream = request.stream === true;
  // Streamed Chat Completions only report usage when asked to.
  if (
    stream &&
    format === 'openai-chat' &&
    (provider === 'openai' || provider === 'ollama')
  ) {
    request.stream_options = {
      ...(typeof request.stream_options === 'object' &&
      request.stream_options !== null
        ? request.stream_options
        : {}),
      include_usage: true,
    };
  }
  return { provider, format, model, stream, body: request };
}

/**
 * The request to the provider: its URL (an organization's Ollama server's
 * from its settings), the key where the provider wants it, and the headers
 * passed on.
 */
export function upstreamRequest(
  call: ProviderCall,
  path: string,
  query: string,
  key: ModelKeySettings,
  urls: ProviderUrls,
  incoming: Record<string, string | string[] | undefined>,
): UpstreamRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: call.stream ? 'text/event-stream' : 'application/json',
  };
  for (const name of FORWARDED[call.provider] ?? []) {
    const value = incoming[name];
    if (typeof value === 'string') {
      headers[name] = value;
    }
  }
  const apiKey = key.apiKey ?? '';
  let base: string;
  switch (call.provider) {
    case 'anthropic':
      base = urls.anthropic;
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] ??= '2023-06-01';
      break;
    case 'google':
      base = urls.google;
      headers['x-goog-api-key'] = apiKey;
      break;
    case 'ollama':
      base = key.baseUrl ?? '';
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      break;
    default:
      base = call.provider === 'mistral' ? urls.mistral : urls.openai;
      headers.authorization = `Bearer ${apiKey}`;
  }
  // Only Google's streams need a query (`alt=sse`); nothing else is passed.
  const search =
    call.provider === 'google' &&
    new URLSearchParams(query).get('alt') === 'sse'
      ? '?alt=sse'
      : '';
  return {
    url: `${base.replace(/\/+$/, '')}/${path}${search}`,
    headers,
    body: JSON.stringify(call.body),
  };
}
