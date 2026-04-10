/**
 * @module @kb-labs/llm-router
 * Adaptive LLM router with tier-based model selection.
 *
 * Wraps an ILLM adapter with:
 * - Tier-based routing (small/medium/large)
 * - Adaptive escalation/degradation
 * - Capability checking
 *
 * @example
 * ```typescript
 * import { LLMRouter } from '@kb-labs/llm-router';
 *
 * const router = new LLMRouter(openaiAdapter, { tier: 'medium' }, logger);
 *
 * // Resolve tier request
 * const resolution = router.resolve({ tier: 'small' });
 * // → Uses 'medium' (escalation)
 *
 * // Use as ILLM
 * await router.complete('Hello');
 * ```
 */

export {
  LLMRouter,
  type LLMRouterConfig,
  type TierMapping,
  type TierModelEntry,
  type AdapterLoader,
} from './router.js';
export { TierResolver, CapabilityResolver, type ResolveResult } from './resolver.js';
export { manifest } from './manifest.js';

// Re-export types for convenience
export type {
  LLMTier,
  LLMCapability,
  UseLLMOptions,
  LLMResolution,
  ILLMRouter,
} from '@kb-labs/core-platform';
