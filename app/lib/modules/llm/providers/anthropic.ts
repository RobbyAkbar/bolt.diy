import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';

// Override with ANTHROPIC_API_BASE_URL for Anthropic-compatible hosts, e.g. Azure Foundry's https://<resource>.services.ai.azure.com/anthropic/v1
const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';

export default class AnthropicProvider extends BaseProvider {
  name = 'Anthropic';
  getApiKeyLink = 'https://console.anthropic.com/settings/keys';

  config = {
    baseUrlKey: 'ANTHROPIC_API_BASE_URL',
    apiTokenKey: 'ANTHROPIC_API_KEY',
    baseUrl: DEFAULT_BASE_URL,
  };

  staticModels: ModelInfo[] = [
    {
      name: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-haiku-5-5',
      label: 'Claude Haiku 5.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-fable-5',
      label: 'Claude Fable 5',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-opus-4-8',
      label: 'Claude Opus 4.8',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'claude-3-5-sonnet-20241022',
      label: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-3-haiku-20240307',
      label: 'Claude 3 Haiku',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'claude-opus-4-20250514',
      label: 'Claude 4 Opus',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 32000,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'ANTHROPIC_API_BASE_URL',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        'x-api-key': `${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      throw new Error(`${this.name}: model list request failed with HTTP ${response.status}`);
    }

    const res = (await response.json()) as any;
    const staticModelIds = this.staticModels.map((m) => m.name);

    const data = res.data.filter((model: any) => model.type === 'model' && !staticModelIds.includes(model.id));

    return data.map((m: any) => {
      // Get accurate context window from Anthropic API
      let contextWindow = 32000; // default fallback

      // Anthropic provides max_tokens in their API response
      if (m.max_tokens) {
        contextWindow = m.max_tokens;
      } else if (
        m.id?.includes('claude-fable-5') ||
        m.id?.includes('claude-opus-4-8') ||
        m.id?.includes('claude-sonnet-4-6')
      ) {
        contextWindow = 1000000;
      } else if (m.id?.includes('claude-haiku-4-5')) {
        contextWindow = 200000;
      } else if (m.id?.includes('claude-3-5-sonnet')) {
        contextWindow = 200000; // Claude 3.5 Sonnet has 200k context
      } else if (m.id?.includes('claude-3-haiku')) {
        contextWindow = 200000; // Claude 3 Haiku has 200k context
      } else if (m.id?.includes('claude-3-opus')) {
        contextWindow = 200000; // Claude 3 Opus has 200k context
      } else if (m.id?.includes('claude-3-sonnet')) {
        contextWindow = 200000; // Claude 3 Sonnet has 200k context
      }

      // Determine completion token limits based on specific model
      let maxCompletionTokens = 128000; // default for older Claude 3 models

      if (
        m.id?.includes('claude-fable-5') ||
        m.id?.includes('claude-opus-4-8') ||
        m.id?.includes('claude-sonnet-4-6')
      ) {
        maxCompletionTokens = 128000;
      } else if (m.id?.includes('claude-haiku-4-5')) {
        maxCompletionTokens = 64000;
      } else if (m.id?.includes('claude-opus-4')) {
        maxCompletionTokens = 32000; // Claude 4 Opus: 32K output limit
      } else if (m.id?.includes('claude-sonnet-4')) {
        maxCompletionTokens = 64000; // Claude 4 Sonnet: 64K output limit
      } else if (m.id?.includes('claude-4')) {
        maxCompletionTokens = 32000; // Other Claude 4 models: conservative 32K limit
      }

      return {
        name: m.id,
        label: `${m.display_name} (${Math.floor(contextWindow / 1000)}k context)`,
        provider: this.name,
        maxTokenAllowed: contextWindow,
        maxCompletionTokens,
      };
    });
  }

  getModelInstance: (options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModel = (options) => {
    const { apiKeys, providerSettings, serverEnv, model } = options;

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'ANTHROPIC_API_BASE_URL',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });
    const anthropic = createAnthropic({
      apiKey,
      baseURL: baseUrl,

      // ponytail: the beta header is only sent to Anthropic itself; compatible hosts like Azure may reject unknown betas.
      ...(baseUrl === DEFAULT_BASE_URL ? { headers: { 'anthropic-beta': 'output-128k-2025-02-19' } } : {}),
    });

    return anthropic(model);
  };
}
