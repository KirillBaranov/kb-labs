import type { AdapterManifest } from "@kb-labs/core-platform";

export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "kblabs-gateway-llm",
  name: "KB Labs Gateway LLM",
  version: "0.1.0",
  description:
    "KB Labs Gateway adapter — OpenAI-compatible LLM proxy with automatic JWT token refresh",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ILLM",
  capabilities: {
    streaming: false,
    custom: {
      functionCalling: true,
      autoTokenRefresh: true,
    },
  },
  configSchema: {
    gatewayURL: {
      type: "string",
      default: "https://api.kblabs.ru",
      description: "KB Labs Gateway base URL",
    },
    kbClientId: {
      type: "string",
      description: "Machine identity client ID (from kb-create --demo)",
    },
    kbClientSecret: {
      type: "string",
      description: "Machine identity client secret (from kb-create --demo)",
    },
    apiKey: {
      type: "string",
      description: "Static Bearer token (alternative to clientId/clientSecret)",
    },
    defaultModel: {
      type: "string",
      default: "small",
      description: "Default model tier: small | medium | large",
    },
  },
};
