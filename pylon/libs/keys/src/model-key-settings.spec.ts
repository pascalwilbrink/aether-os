import { checkModelKeySettings } from './model-key-settings.js';

const strict = { allowPrivate: false };
const local = { allowPrivate: true };

describe('checkModelKeySettings', () => {
  it('takes an API key, and only that, for hosted providers', () => {
    expect(
      checkModelKeySettings('openai', { apiKey: ' sk-1234567890 ' }, strict),
    ).toEqual({
      apiKey: 'sk-1234567890',
    });
    expect(checkModelKeySettings('openai', {}, strict)).toEqual({
      problem: 'A openai key needs its apiKey.',
    });
    expect(
      checkModelKeySettings(
        'anthropic',
        { apiKey: 'sk-ant-12345678', baseUrl: 'https://x.test' },
        strict,
      ),
    ).toEqual({ problem: 'A anthropic key has no base URL.' });
  });

  it("takes an Ollama server's base URL and maybe a key", () => {
    expect(
      checkModelKeySettings(
        'ollama',
        { baseUrl: 'https://ollama.example.com/' },
        strict,
      ),
    ).toEqual({
      baseUrl: 'https://ollama.example.com',
    });
    expect(
      checkModelKeySettings(
        'ollama',
        { baseUrl: 'https://ollama.example.com', apiKey: 'secret-12345' },
        strict,
      ),
    ).toEqual({
      baseUrl: 'https://ollama.example.com',
      apiKey: 'secret-12345',
    });
    expect(
      checkModelKeySettings('ollama', { apiKey: 'secret-12345' }, strict),
    ).toMatchObject({
      problem: expect.stringContaining('needs its baseUrl'),
    });
  });

  it('calls a local Ollama only where private addresses are allowed', () => {
    expect(
      checkModelKeySettings(
        'ollama',
        { baseUrl: 'http://localhost:11434' },
        strict,
      ),
    ).toMatchObject({
      problem: expect.stringContaining('https'),
    });
    expect(
      checkModelKeySettings('ollama', { baseUrl: 'https://10.0.0.5' }, strict),
    ).toMatchObject({
      problem: expect.stringContaining('private'),
    });
    expect(
      checkModelKeySettings(
        'ollama',
        { baseUrl: 'http://localhost:11434' },
        local,
      ),
    ).toEqual({
      baseUrl: 'http://localhost:11434',
    });
  });
});
