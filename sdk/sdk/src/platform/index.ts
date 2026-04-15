/**
 * Platform client — HTTP-level access to the gateway.
 *
 * Use this from external apps that need to talk to a KB Labs platform
 * deployment over the network. Inside a plugin, prefer the in-process
 * hooks (`useLLM`, `useCache`, ...) — they don't pay the HTTP round-trip.
 *
 * Thin re-export of `@kb-labs/platform-client` so consumers can import
 * everything from the canonical `@kb-labs/sdk` namespace:
 *
 * ```ts
 * import { KBPlatform } from '@kb-labs/sdk/platform';
 *
 * const platform = new KBPlatform({
 *   endpoint: 'http://localhost:4000',
 *   apiKey: process.env.KB_API_KEY!,
 * });
 *
 * const res = await platform.llm.complete('Summarise this file');
 * ```
 */
export {
  KBPlatform,
  LLMProxy,
  CacheProxy,
  VectorStoreProxy,
  AnalyticsProxy,
} from '@kb-labs/platform-client';

export type {
  KBPlatformOptions,
  PlatformCallResponse,
  LLMOptions,
  LLMResponse,
  LLMToolCallResponse,
  TelemetryEvent,
} from '@kb-labs/platform-client';
