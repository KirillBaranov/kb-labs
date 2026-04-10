/**
 * @module @kb-labs/core-platform/adapters/llm-types
 * LLM tier and capability types for adaptive model routing.
 *
 * These types define the abstract layer between plugins and LLM providers.
 * Plugins request tiers/capabilities, platform resolves to actual models.
 *
 * @example
 * ```typescript
 * import { LLMTier, LLMCapability, UseLLMOptions } from '@kb-labs/sdk';
 *
 * // Plugin requests by tier (user decides what model)
 * const llm = useLLM({ tier: 'small' });
 * const llm = useLLM({ tier: 'large', capabilities: ['reasoning'] });
 * ```
 */

import type { ILLM, LLMExecutionPolicy } from './llm.js';

/**
 * Model quality tier - user-defined slots.
 *
 * Tiers are NOT tied to specific models. They are abstract slots
 * that the user fills with whatever models they want in config.
 *
 * Plugin intent:
 * - `small`  - "This task is simple, doesn't need much"
 * - `medium` - "Standard task"
 * - `large`  - "Complex task, need maximum quality"
 *
 * User decides what model maps to each tier in their config.
 */
export type LLMTier = "small" | "medium" | "large";

/**
 * Model capabilities - task-optimized features.
 *
 * - `fast`      - Lowest latency (for real-time responses)
 * - `reasoning` - Complex reasoning (o1, opus-level thinking)
 * - `coding`    - Code-optimized (better at code generation/review)
 * - `vision`    - Image input support
 */
export type LLMCapability = "reasoning" | "coding" | "vision" | "fast";

/**
 * Options for useLLM() - plugin-facing API.
 *
 * Plugins specify what they need abstractly.
 * Platform resolves to actual provider/model based on user config.
 */
export interface UseLLMOptions {
  /**
   * Quality tier (user-defined slot).
   * Platform adapts if exact tier unavailable:
   * - Escalates up (small → medium) silently
   * - Degrades down (large → medium) with warning
   */
  tier?: LLMTier;

  /**
   * Required capabilities.
   * Platform selects model that supports ALL requested capabilities.
   */
  capabilities?: LLMCapability[];

  /**
   * Optional execution policy applied to this bound LLM instance.
   * Can be overridden per-call via LLMOptions.execution.
   */
  execution?: LLMExecutionPolicy;
}

/**
 * Resolution result from tier/capability matching.
 * Internal type used by LLMRouter.
 */
export interface LLMResolution {
  /** Resolved provider ID (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Resolved model name */
  model: string;
  /** Resource name for ResourceBroker (e.g., 'llm:openai') */
  resource: string;
  /** Original requested tier */
  requestedTier: LLMTier | undefined;
  /** Actual tier being used */
  actualTier: LLMTier;
  /** Whether this was escalated/degraded */
  adapted: boolean;
  /** Warning message if degraded */
  warning?: string;
}

/**
 * Resolved adapter binding — immutable snapshot of a tier resolution.
 * Returned by resolveAdapter() to avoid global state mutation.
 */
export interface LLMAdapterBinding {
  /** The concrete adapter instance (already wrapped with analytics, etc.) */
  adapter: ILLM;
  /** Resolved model name */
  model: string;
  /** Actual tier used */
  tier: LLMTier;
}

/**
 * LLM Router interface - extends ILLM with routing capabilities.
 * Implemented by @kb-labs/llm-router.
 */
export interface ILLMRouter {
  /** Get configured tier (what user set in config) */
  getConfiguredTier(): LLMTier;

  /** Resolve tier request to actual model (mutates router state — legacy) */
  resolve(options?: UseLLMOptions): LLMResolution;

  /**
   * Resolve tier and return an immutable adapter binding.
   * Does NOT mutate router state — safe for concurrent useLLM() calls.
   */
  resolveAdapter(options?: UseLLMOptions): Promise<LLMAdapterBinding>;

  /** Check if capability is available */
  hasCapability(capability: LLMCapability): boolean;

  /** Get available capabilities */
  getCapabilities(): LLMCapability[];
}

/**
 * Tier order for resolution (lowest to highest).
 */
export const TIER_ORDER: readonly LLMTier[] = [
  "small",
  "medium",
  "large",
] as const;

/**
 * Check if tier A is higher than tier B.
 */
export function isTierHigher(a: LLMTier, b: LLMTier): boolean {
  return TIER_ORDER.indexOf(a) > TIER_ORDER.indexOf(b);
}

/**
 * Check if tier A is lower than tier B.
 */
export function isTierLower(a: LLMTier, b: LLMTier): boolean {
  return TIER_ORDER.indexOf(a) < TIER_ORDER.indexOf(b);
}
