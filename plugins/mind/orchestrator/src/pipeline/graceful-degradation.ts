/**
 * Graceful Degradation Handler
 *
 * Handles pipeline failures by falling back to simpler modes.
 * thinking → auto → instant → raw chunks
 */

import type { AgentQueryMode, AgentWarning, AgentResponse } from '../types';
import type { MindChunk } from '@kb-labs/mind-types';

export interface DegradationResult {
  /** Whether fallback was triggered */
  degraded: boolean;
  /** Original mode that failed */
  originalMode?: AgentQueryMode;
  /** Mode we fell back to */
  fallbackMode?: AgentQueryMode;
  /** Warning to include in response */
  warning?: AgentWarning;
  /** Error that triggered degradation */
  error?: Error;
}

export interface PipelineStepConfig {
  name: string;
  timeout: number;
  retries?: number;
  fallbackMode?: AgentQueryMode | 'raw';
}

export interface GracefulDegradationOptions {
  /** Enable graceful degradation */
  enabled?: boolean;
  /** Log degradation events */
  onDegrade?: (result: DegradationResult) => void;
  /** Step configurations */
  steps?: Record<string, PipelineStepConfig>;
}

const DEFAULT_STEPS: Record<string, PipelineStepConfig> = {
  decompose: {
    name: 'decompose',
    timeout: 10000,
    retries: 1,
    fallbackMode: 'auto',
  },
  gather: {
    name: 'gather',
    timeout: 30000,
    retries: 2,
    fallbackMode: 'instant',
  },
  check: {
    name: 'check',
    timeout: 15000,
    retries: 1,
    fallbackMode: 'auto',
  },
  synthesize: {
    name: 'synthesize',
    timeout: 30000,
    retries: 2,
    fallbackMode: 'instant',
  },
};

/**
 * Graceful Degradation Handler
 */
export class GracefulDegradationHandler {
  private readonly options: Required<GracefulDegradationOptions>;

  constructor(options: GracefulDegradationOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      onDegrade: options.onDegrade ?? (() => {}),
      steps: { ...DEFAULT_STEPS, ...options.steps },
    };
  }

  /**
   * Execute a pipeline step with graceful fallback
   */
  async executeWithFallback<T>(
    stepName: string,
    currentMode: AgentQueryMode,
    execute: () => Promise<T>,
    fallback: (mode: AgentQueryMode | 'raw') => Promise<T>,
  ): Promise<{ result: T; degradation?: DegradationResult }> {
    if (!this.options.enabled) {
      return { result: await execute() };
    }

    const stepConfig = this.options.steps[stepName] ?? {
      name: stepName,
      timeout: 30000,
      retries: 1,
      fallbackMode: 'instant' as const,
    };

    let lastError: Error | undefined;
    let attempts = 0;
    const maxAttempts = (stepConfig.retries ?? 0) + 1;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const result = await this.executeWithTimeout(execute, stepConfig.timeout);
        return { result };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (attempts < maxAttempts && this.isRetryable(error)) {
          continue;
        }
      }
    }

    // All attempts failed - trigger fallback
    const fallbackMode = stepConfig.fallbackMode ?? this.getNextMode(currentMode);
    const degradation: DegradationResult = {
      degraded: true,
      originalMode: currentMode,
      fallbackMode: fallbackMode === 'raw' ? undefined : fallbackMode,
      warning: {
        code: 'FALLBACK_MODE',
        message: `Step "${stepName}" failed, falling back to ${fallbackMode} mode`,
        details: {
          originalMode: currentMode,
          fallbackMode: fallbackMode === 'raw' ? 'instant' : fallbackMode,
        },
      },
      error: lastError,
    };

    this.options.onDegrade(degradation);

    const result = await fallback(fallbackMode);
    return { result, degradation };
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    execute: () => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      execute()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      // Network errors are retryable
      if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
        return true;
      }
      // Rate limits are retryable
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        return true;
      }
      // Timeouts might be transient
      if (error.message.includes('timeout')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get next simpler mode in degradation chain
   */
  private getNextMode(currentMode: AgentQueryMode): AgentQueryMode | 'raw' {
    switch (currentMode) {
      case 'thinking':
        return 'auto';
      case 'auto':
        return 'instant';
      case 'instant':
        return 'raw';
      default:
        return 'raw';
    }
  }

  /**
   * Create a raw chunks response (last resort)
   */
  static createRawResponse(
    chunks: MindChunk[],
    requestId: string,
    originalMode: AgentQueryMode,
    timingMs: number,
  ): AgentResponse {
    const topChunks = chunks.slice(0, 5);

    return {
      answer: topChunks.length > 0
        ? `Found ${chunks.length} relevant code locations. Top results:\n\n` +
          topChunks.map((c, i) =>
            `${i + 1}. ${c.path} (lines ${c.span.startLine}-${c.span.endLine})`
          ).join('\n')
        : 'No relevant code found.',
      sources: topChunks.map(c => ({
        file: c.path,
        lines: [c.span.startLine, c.span.endLine] as [number, number],
        snippet: c.text.slice(0, 200) + (c.text.length > 200 ? '...' : ''),
        relevance: `Score: ${(c.score ?? 0).toFixed(2)}`,
        kind: 'code' as const,
      })),
      confidence: chunks.length > 0 ? 0.3 : 0,
      complete: false,
      warnings: [{
        code: 'FALLBACK_MODE',
        message: 'Full processing failed, showing raw search results',
        details: {
          originalMode,
          fallbackMode: 'instant',
        },
      }],
      meta: {
        schemaVersion: 'agent-response-v1',
        requestId,
        mode: 'instant',
        timingMs,
        cached: false,
      },
    };
  }
}

/**
 * Mode degradation chain for easy iteration
 */
export const MODE_DEGRADATION_CHAIN: AgentQueryMode[] = ['thinking', 'auto', 'instant'];

/**
 * Get degraded mode
 */
export function getDegradedMode(currentMode: AgentQueryMode): AgentQueryMode | null {
  const currentIndex = MODE_DEGRADATION_CHAIN.indexOf(currentMode);
  if (currentIndex === -1 || currentIndex >= MODE_DEGRADATION_CHAIN.length - 1) {
    return null;
  }
  return MODE_DEGRADATION_CHAIN[currentIndex + 1] ?? null;
}

export function createGracefulDegradationHandler(
  options?: GracefulDegradationOptions,
): GracefulDegradationHandler {
  return new GracefulDegradationHandler(options);
}
