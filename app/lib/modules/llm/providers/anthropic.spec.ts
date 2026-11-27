import { afterEach, describe, expect, it, vi } from 'vitest';
import AnthropicProvider from './anthropic';

afterEach(() => vi.unstubAllGlobals());

describe('Anthropic base URL', () => {
  it('lists models from a configured Anthropic-compatible host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await new AnthropicProvider().getDynamicModels(
      { Anthropic: 'key' },
      { baseUrl: 'https://res.services.ai.azure.com/anthropic/v1/' },
    );

    expect(fetchMock.mock.calls[0][0]).toBe('https://res.services.ai.azure.com/anthropic/v1/models');
  });

  it('falls back to static models when a compatible host has no model list endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

    const models = await new AnthropicProvider().getDynamicModels(
      { Anthropic: 'key' },
      { baseUrl: 'https://res.services.ai.azure.com/anthropic/v1' },
    );

    expect(models).toEqual([]);
  });

  it('defaults to api.anthropic.com', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await new AnthropicProvider().getDynamicModels({ Anthropic: 'key' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/models');
  });

  it('sends chat requests to the configured host without the Anthropic-only beta header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const model = new AnthropicProvider().getModelInstance({
      model: 'claude-opus-5-5',
      serverEnv: {} as Env,
      apiKeys: { Anthropic: 'key' },
      providerSettings: { Anthropic: { baseUrl: 'https://res.services.ai.azure.com/anthropic/v1' } },
    });

    if (typeof model === 'string') {
      throw new Error('expected a model instance');
    }

    await Promise.resolve(
      model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] }),
    ).catch(() => undefined);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://res.services.ai.azure.com/anthropic/v1/messages');
    expect(JSON.stringify(init.headers)).not.toContain('anthropic-beta');
  });
});
