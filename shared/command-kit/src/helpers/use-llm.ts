/**
 * @module @kb-labs/shared-command-kit/helpers/use-llm
 * Global LLM access helper with tier-based model selection.
 *
 * Provides clean access to LLM with adaptive tier routing.
 * Plugins specify tiers (small/medium/large), platform resolves to actual models.
 *
 * @example
 * ```typescript
 * import { useLLM } from '@kb-labs/shared-command-kit';
 *
 * async handler(ctx, argv, flags) {
 *   // Simple usage (uses configured default tier)
 *   const llm = useLLM();
 *
 *   // Request specific tier (platform adapts if needed)
 *   const llm = useLLM({ tier: 'small' });   // Simple tasks
 *   const llm = useLLM({ tier: 'large' });   // Complex tasks
 *
 *   // Request capabilities
 *   const llm = useLLM({ tier: 'medium', capabilities: ['coding'] });
 *
 *   if (llm) {
 *     const result = await llm.complete('Explain this code');
 *     console.log(result.content);
 *   }
 * }
 * ```
 */

import { usePlatform } from './use-platform.js';
import type {
  ILLM,
  LLMTier,
  LLMOptions,
  LLMResponse,
  LLMMessage,
  LLMToolCallOptions,
  LLMToolCallResponse,
  UseLLMOptions,
  ILLMRouter,
  LLMAdapterBinding,
  LLMExecutionPolicy,
  LLMProtocolCapabilities,
  LLMCacheDecisionTrace,
} from '@kb-labs/core-platform';

/**
 * Access global LLM adapter with tier-based selection.
 *
 * Platform automatically adapts to available models:
 * - If plugin requests 'small' but 'medium' configured → uses 'medium' (escalation)
 * - If plugin requests 'large' but 'medium' configured → uses 'medium' with warning (degradation)
 *
 * **Tiers are user-defined slots:**
 * - `small`  - Plugin says: "This task is simple"
 * - `medium` - Plugin says: "Standard task"
 * - `large`  - Plugin says: "Complex task, need maximum quality"
 *
 * User decides what model maps to each tier in their config.
 *
 * @param options - Optional tier and capability requirements
 * @returns LLM adapter or undefined if not configured
 *
 * @example
 * ```typescript
 * // Simple usage (uses configured default)
 * const llm = useLLM();
 *
 * // Request specific tier
 * const llm = useLLM({ tier: 'small' });   // Simple tasks
 * const llm = useLLM({ tier: 'large' });   // Complex tasks
 *
 * // Request capabilities
 * const llm = useLLM({ tier: 'medium', capabilities: ['coding'] });
 * const llm = useLLM({ capabilities: ['vision'] });
 *
 * if (llm) {
 *   const result = await llm.complete('Generate commit message');
 *   console.log(result.content);
 * }
 * ```
 */
export function useLLM(options?: UseLLMOptions): ILLM | undefined {
  const platform = usePlatform();
  const llm = platform.llm;

  if (!llm) {
    return undefined;
  }

  // If router and options given → return immutable LazyBoundLLM (no state mutation)
  if (options && isLLMRouter(llm)) {
    return new LazyBoundLLM(llm, options);
  }

  return llm;
}

/**
 * Lazy adapter binding that resolves tier on first use.
 * Immutable — does NOT mutate the global LLMRouter state.
 * This fixes the race condition where useLLM({ tier: 'large' }) was immediately
 * overwritten by useLLM({ tier: 'small' }) from SmartSummarizer.
 */
class LazyBoundLLM implements ILLM {
  private _resolved: Promise<LLMAdapterBinding> | null = null;

  constructor(
    private readonly router: ILLM & ILLMRouter,
    private readonly options: UseLLMOptions,
  ) {}

  private resolve(): Promise<LLMAdapterBinding> {
    if (!this._resolved) {
      this._resolved = this.router.resolveAdapter(this.options);
    }
    return this._resolved;
  }

  private mergeExecutionPolicy(callOptions?: LLMOptions): LLMExecutionPolicy | undefined {
    const globalPolicy = this.options.execution;
    const localPolicy = callOptions?.execution;
    if (!globalPolicy && !localPolicy) {
      return undefined;
    }
    return {
      ...globalPolicy,
      ...localPolicy,
      cache: { ...globalPolicy?.cache, ...localPolicy?.cache },
      stream: { ...globalPolicy?.stream, ...localPolicy?.stream },
    };
  }

  private async resolveProtocolCapabilities(adapter: ILLM): Promise<LLMProtocolCapabilities> {
    if (!adapter.getProtocolCapabilities) {
      return {
        cache: { supported: false },
        stream: { supported: true },
      };
    }
    return adapter.getProtocolCapabilities();
  }

  private enforceCachePolicy(caps: LLMProtocolCapabilities, execution?: LLMExecutionPolicy): void {
    if (execution?.cache?.mode === 'require' && !caps.cache.supported) {
      throw new Error('CACHE_NOT_SUPPORTED: adapter does not support required cache policy');
    }
  }

  private buildDecisionTrace(
    caps: LLMProtocolCapabilities,
    execution: LLMExecutionPolicy | undefined,
    streamAppliedMode: 'prefer' | 'require' | 'off',
    streamFallback?: 'complete',
    reason?: string,
  ): LLMCacheDecisionTrace {
    const requestedCacheMode = execution?.cache?.mode ?? 'prefer';
    const requestedStreamMode = execution?.stream?.mode ?? 'prefer';

    return {
      cacheRequestedMode: requestedCacheMode,
      cacheSupported: caps.cache.supported,
      cacheAppliedMode:
        requestedCacheMode === 'require' || requestedCacheMode === 'bypass'
          ? requestedCacheMode
          : caps.cache.supported
            ? 'prefer'
            : 'bypass',
      streamRequestedMode: requestedStreamMode,
      streamSupported: caps.stream.supported,
      streamAppliedMode,
      streamFallback,
      reason,
    };
  }

  private withDecisionMetadata(
    options: LLMOptions | undefined,
    trace: LLMCacheDecisionTrace,
  ): LLMOptions | undefined {
    if (!options) {
      return { metadata: { cacheDecisionTrace: trace } };
    }

    return {
      ...options,
      metadata: {
        ...options.metadata,
        cacheDecisionTrace: trace,
      },
    };
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const { adapter, model } = await this.resolve();
    const execution = this.mergeExecutionPolicy(options);
    const caps = await this.resolveProtocolCapabilities(adapter);
    this.enforceCachePolicy(caps, execution);
    const trace = this.buildDecisionTrace(caps, execution, 'off');
    const optionsWithTrace = this.withDecisionMetadata(options, trace);
    return adapter.complete(prompt, { ...optionsWithTrace, model, execution });
  }

  async *stream(prompt: string, options?: LLMOptions): AsyncIterable<string> {
    const { adapter, model } = await this.resolve();
    const execution = this.mergeExecutionPolicy(options);
    const caps = await this.resolveProtocolCapabilities(adapter);
    this.enforceCachePolicy(caps, execution);

    const streamMode = execution?.stream?.mode ?? 'prefer';
    const canStream = caps.stream.supported;
    const allowFallback = execution?.stream?.fallbackToComplete ?? true;

    if (streamMode === 'off' || (!canStream && streamMode === 'prefer' && allowFallback)) {
      const fallbackReason =
        streamMode === 'off'
          ? 'STREAM_OFF'
          : 'STREAM_UNSUPPORTED_FALLBACK_TO_COMPLETE';
      const trace = this.buildDecisionTrace(caps, execution, 'off', 'complete', fallbackReason);
      const optionsWithTrace = this.withDecisionMetadata(options, trace);
      const response = await adapter.complete(prompt, { ...optionsWithTrace, model, execution });
      if (response.content) {
        yield response.content;
      }
      return;
    }

    if (!canStream && streamMode === 'require') {
      throw new Error('STREAM_NOT_SUPPORTED: adapter does not support required streaming');
    }

    const trace = this.buildDecisionTrace(caps, execution, streamMode);
    const optionsWithTrace = this.withDecisionMetadata(options, trace);
    yield* adapter.stream(prompt, { ...optionsWithTrace, model, execution });
  }

  async chatWithTools(
    messages: LLMMessage[],
    options: LLMToolCallOptions,
  ): Promise<LLMToolCallResponse> {
    const { adapter, model, tier } = await this.resolve();
    const execution = this.mergeExecutionPolicy(options);
    const caps = await this.resolveProtocolCapabilities(adapter);
    this.enforceCachePolicy(caps, execution);
    if (!adapter.chatWithTools) {
      throw new Error('Current adapter does not support chatWithTools');
    }
    const trace = this.buildDecisionTrace(caps, execution, 'off');
    const optionsWithTrace = this.withDecisionMetadata(options, trace) as LLMToolCallOptions;
    return adapter.chatWithTools(messages, {
      ...optionsWithTrace,
      model,
      execution,
      metadata: { ...optionsWithTrace.metadata, tier },
    });
  }
}

/**
 * Check if LLM is available.
 *
 * Useful for conditional logic (LLM-powered vs deterministic fallback).
 *
 * @returns true if LLM is configured and ready
 *
 * @example
 * ```typescript
 * if (isLLMAvailable()) {
 *   const summary = await generateWithLLM(data);
 * } else {
 *   const summary = generateDeterministic(data);
 * }
 * ```
 */
export function isLLMAvailable(): boolean {
  const llm = useLLM();
  return !!llm;
}

/**
 * Get configured LLM tier.
 *
 * Useful for diagnostics and logging.
 *
 * @returns Configured tier or undefined if LLM not available/not a router
 *
 * @example
 * ```typescript
 * const tier = getLLMTier();
 * console.log(`Using LLM tier: ${tier ?? 'default'}`);
 * ```
 */
export function getLLMTier(): LLMTier | undefined {
  const platform = usePlatform();
  const llm = platform.llm;

  if (llm && isLLMRouter(llm)) {
    return llm.getConfiguredTier();
  }

  return undefined;
}

/**
 * Type guard for ILLMRouter.
 */
function isLLMRouter(llm: ILLM): llm is ILLM & ILLMRouter {
  return (
    typeof (llm as unknown as ILLMRouter).getConfiguredTier === 'function' &&
    typeof (llm as unknown as ILLMRouter).resolve === 'function'
  );
}

// Re-export types for convenience
export type { LLMTier, UseLLMOptions } from '@kb-labs/core-platform';
