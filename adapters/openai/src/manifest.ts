/**
 * @module @kb-labs/adapters-openai/manifest
 * Adapter manifest for OpenAI LLM.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for OpenAI LLM.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "openai-llm",
  name: "OpenAI LLM",
  version: "1.0.0",
  description: "OpenAI language model adapter (GPT-4, GPT-3.5, etc.)",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ILLM",
  capabilities: {
    streaming: true,
    custom: {
      functionCalling: true,
    },
  },
  configSchema: {
    apiKey: {
      type: "string",
      description: "OpenAI API key (defaults to OPENAI_API_KEY env var)",
    },
    model: {
      type: "string",
      default: "gpt-4o",
      description: "Model to use (gpt-4o, gpt-4-turbo, gpt-3.5-turbo, etc.)",
    },
    temperature: {
      type: "number",
      default: 0.7,
      description: "Sampling temperature (0.0 to 2.0)",
    },
    maxTokens: {
      type: "number",
      description: "Maximum tokens to generate",
    },
  },
};
