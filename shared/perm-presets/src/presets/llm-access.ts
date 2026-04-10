import type { PermissionPreset } from '../types';

/**
 * LLM Access preset - for plugins that use LLM APIs
 * Includes OpenAI and Anthropic API keys and network access
 */
export const llmAccess: PermissionPreset = {
  id: 'llm-access',
  description: 'LLM API access - OpenAI, Anthropic keys and network',
  permissions: {
    env: {
      read: [
        'OPENAI_API_KEY',
        'OPENAI_ORG_ID',
        'OPENAI_BASE_URL',
        'ANTHROPIC_API_KEY',
        'AZURE_OPENAI_*',     // Azure OpenAI
        'LLM_*',              // Generic LLM config
      ],
    },
    network: {
      fetch: [
        'api.openai.com',
        'api.anthropic.com',
        '*.openai.azure.com', // Azure OpenAI
      ],
    },
  },
};
