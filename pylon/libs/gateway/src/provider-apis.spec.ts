import {
  providerCall,
  upstreamRequest,
  type ProviderCall,
} from './provider-apis.js';

const urls = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/',
  mistral: 'https://api.mistral.ai',
  google: 'https://generativelanguage.googleapis.com',
};

const call = (provider: string, path: string, body: unknown) => {
  const result = providerCall(provider, path, body);
  if ('problem' in result) throw new Error(result.problem);
  return result as ProviderCall;
};

describe('provider APIs', () => {
  it('recognises the routes it passes on, and refuses the rest', () => {
    expect(
      call('anthropic', 'v1/messages', { model: 'm', stream: true }),
    ).toMatchObject({
      format: 'anthropic-messages',
      model: 'm',
      stream: true,
    });
    expect(call('openai', 'v1/responses', { model: 'm' }).format).toBe(
      'openai-responses',
    );
    expect(
      call('google', 'v1beta/models/gemini-3:streamGenerateContent', {}),
    ).toMatchObject({ model: 'gemini-3', stream: true });

    for (const [provider, path, body] of [
      ['anthropic', 'v1/models', { model: 'm' }],
      ['anthropic', 'v1/messages/../../admin', { model: 'm' }],
      ['acme', 'v1/chat/completions', { model: 'm' }],
      ['openai', 'v1/chat/completions', {}],
      ['openai', 'v1/chat/completions', []],
      ['google', 'v1beta/models/gemini-3:countTokens', {}],
    ] as const) {
      expect(providerCall(provider, path, body)).toHaveProperty('problem');
    }
  });

  it('asks OpenAI-style streams for their usage, keeping other options', () => {
    expect(
      call('openai', 'v1/chat/completions', {
        model: 'm',
        stream: true,
        stream_options: { foo: 1 },
      }).body.stream_options,
    ).toEqual({ foo: 1, include_usage: true });
    expect(
      call('openai', 'v1/chat/completions', { model: 'm' }).body,
    ).not.toHaveProperty('stream_options');
  });

  it('puts the key where each provider wants it, and passes on only some headers', () => {
    const anthropic = upstreamRequest(
      call('anthropic', 'v1/messages', { model: 'm' }),
      'v1/messages',
      '',
      { apiKey: 'sk-ant' },
      urls,
      { 'anthropic-beta': 'x', cookie: 'c', authorization: 'Bearer token' },
    );
    expect(anthropic).toMatchObject({
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': 'sk-ant',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'x',
      },
    });
    expect(anthropic.headers).not.toHaveProperty('cookie');
    expect(anthropic.headers).not.toHaveProperty('authorization');

    const google = upstreamRequest(
      call('google', 'v1beta/models/g:streamGenerateContent', {}),
      'v1beta/models/g:streamGenerateContent',
      'alt=sse&key=leak',
      { apiKey: 'g-key' },
      urls,
      {},
    );
    expect(google.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/g:streamGenerateContent?alt=sse',
    );
    expect(google.headers['x-goog-api-key']).toBe('g-key');

    const ollama = upstreamRequest(
      call('ollama', 'v1/chat/completions', { model: 'q' }),
      'v1/chat/completions',
      '',
      { baseUrl: 'https://ollama.example.com' },
      urls,
      {},
    );
    expect(ollama.url).toBe('https://ollama.example.com/v1/chat/completions');
    expect(ollama.headers).not.toHaveProperty('authorization');
    expect(
      upstreamRequest(
        call('openai', 'v1/chat/completions', { model: 'm' }),
        'v1/chat/completions',
        '',
        { apiKey: 'sk' },
        urls,
        {},
      ).url,
    ).toBe('https://api.openai.com/v1/chat/completions');
  });
});
