/**
 * @module @kb-labs/shared-command-kit/helpers/patterns
 * Common patterns for plugin development (spinner, batch processing, retry logic).
 *
 * These patterns make it easy to build robust, user-friendly plugins with
 * proper error handling and progress feedback.
 */

import type { PluginContextV3 as PluginContext } from '@kb-labs/plugin-runtime';

// ═══════════════════════════════════════════════════════════════════════════
// SPINNER PATTERN (Progress feedback)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute function with progress feedback.
 * Shows message while running, updates with success/failure.
 *
 * @param ctx - Plugin context
 * @param message - Progress message (e.g., "Processing files")
 * @param fn - Async function to execute
 * @returns Function result
 * @throws Re-throws any error from fn
 *
 * @example
 * ```typescript
 * const result = await withSpinner(
 *   ctx,
 *   'Indexing documents',
 *   async () => {
 *     // Long-running operation
 *     return await indexDocuments(docs);
 *   }
 * );
 * // Output: "Indexing documents... ✓" (or "✗" on error)
 * ```
 */
export async function withSpinner<T>(
  ctx: PluginContext,
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  ctx.ui?.info(`${message}...`);

  try {
    const result = await fn();
    ctx.ui?.success(`${message} ✓`);
    return result;
  } catch (error) {
    ctx.ui?.error(`${message} ✗`);
    throw error;
  }
}

/**
 * Execute multiple steps with progress feedback.
 * Each step shows its own progress message.
 *
 * @param ctx - Plugin context
 * @param steps - Array of steps with message and function
 * @returns Array of step results
 *
 * @example
 * ```typescript
 * const [docs, vectors, stored] = await withSteps(ctx, [
 *   { message: 'Loading documents', fn: () => loadDocuments() },
 *   { message: 'Generating embeddings', fn: () => generateEmbeddings(docs) },
 *   { message: 'Storing in database', fn: () => storeVectors(vectors) },
 * ]);
 * ```
 */
export async function withSteps<T extends any[]>(
  ctx: PluginContext,
  steps: Array<{ message: string; fn: () => Promise<any> }>
): Promise<T> {
  const results: any[] = [];

  for (const step of steps) {
    const result = await withSpinner(ctx, step.message, step.fn);
    results.push(result);
  }

  return results as T;
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH PROCESSING (Concurrency control)
// ═══════════════════════════════════════════════════════════════════════════

export interface BatchOptions<T, R> {
  /** Maximum concurrent operations (default: 5) */
  concurrency?: number;
  /** Progress callback (called after each item) */
  onProgress?: (completed: number, total: number, item: T, result: R) => void;
  /** Error callback (called on item failure, can decide to continue or throw) */
  onError?: (error: Error, item: T) => void | Promise<void>;
  /** Stop on first error (default: false) */
  stopOnError?: boolean;
}

/**
 * Process array of items with concurrency control.
 * Limits number of concurrent operations for better resource management.
 *
 * @param items - Array of items to process
 * @param fn - Processing function
 * @param options - Batch options
 * @returns Array of results
 *
 * @example
 * ```typescript
 * const results = await processBatch(
 *   files,
 *   async (file) => await processFile(file),
 *   {
 *     concurrency: 10,
 *     onProgress: (completed, total) => {
 *       ctx.ui.info(`Processed ${completed}/${total}`);
 *     },
 *   }
 * );
 * ```
 */
export async function processBatch<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: BatchOptions<T, R> = {}
): Promise<R[]> {
  const { concurrency = 5, onProgress, onError, stopOnError = false } = options;

  const results: R[] = [];
  const errors: Array<{ index: number; item: T; error: Error }> = [];
  let completed = 0;

  // Process in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchPromises = batch.map(async (item, batchIndex) => {
      const index = i + batchIndex;

      try {
        const result = await fn(item, index);
        results[index] = result;
        completed++;

        if (onProgress) {
          onProgress(completed, items.length, item, result);
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ index, item, error: err });

        if (onError) {
          await onError(err, item);
        }

        if (stopOnError) {
          throw err;
        }

        // Continue processing other items
        return undefined as R;
      }
    });

    await Promise.all(batchPromises);
  }

  if (errors.length > 0 && stopOnError) {
    throw new Error(`Batch processing failed: ${errors.length} error(s)`);
  }

  return results;
}

/**
 * Process items in batches with progress feedback in UI.
 * Convenience wrapper combining processBatch with UI updates.
 *
 * @param ctx - Plugin context
 * @param items - Array of items
 * @param fn - Processing function
 * @param options - Batch options (concurrency, etc.)
 * @returns Array of results
 *
 * @example
 * ```typescript
 * const results = await processBatchWithUI(
 *   ctx,
 *   files,
 *   async (file) => await processFile(file),
 *   { concurrency: 10 }
 * );
 * // Automatically shows: "Processing 1/100... 2/100..."
 * ```
 */
export async function processBatchWithUI<T, R>(
  ctx: PluginContext,
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: Omit<BatchOptions<T, R>, 'onProgress'> = {}
): Promise<R[]> {
  return processBatch(items, fn, {
    ...options,
    onProgress: (completed, total) => {
      ctx.ui.info(`Processing ${completed}/${total}...`);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRY LOGIC (Error recovery)
// ═══════════════════════════════════════════════════════════════════════════

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms (default: 1000) */
  delay?: number;
  /** Backoff multiplier (default: 2 = exponential) */
  backoff?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Callback before each retry */
  onRetry?: (attempt: number, error: Error) => void | Promise<void>;
  /** Predicate to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Retry function with exponential backoff.
 * Useful for transient failures (network, rate limits, etc.).
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Function result
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * const data = await retryWithBackoff(
 *   async () => await fetchFromAPI(),
 *   {
 *     maxRetries: 5,
 *     delay: 1000,
 *     backoff: 2,
 *     onRetry: (attempt, error) => {
 *       console.log(`Retry ${attempt}: ${error.message}`);
 *     },
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delay = 1000,
    backoff = 2,
    maxDelay = 30000,
    onRetry,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | undefined;
  let currentDelay = delay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!shouldRetry(lastError)) {
        throw lastError;
      }

      // Last attempt - don't retry
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Callback before retry
      if (onRetry) {
        await onRetry(attempt + 1, lastError);
      }

      // Wait before retry
      await sleep(Math.min(currentDelay, maxDelay));

      // Increase delay (exponential backoff)
      currentDelay *= backoff;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry loop exhausted without error');
}

/**
 * Retry with backoff and UI feedback.
 * Shows retry attempts to user.
 *
 * @param ctx - Plugin context
 * @param message - Operation description
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Function result
 *
 * @example
 * ```typescript
 * const data = await retryWithUI(
 *   ctx,
 *   'Fetching data from API',
 *   async () => await api.getData(),
 *   { maxRetries: 3 }
 * );
 * // Output: "Retrying (1/3)...", "Retrying (2/3)..."
 * ```
 */
export async function retryWithUI<T>(
  ctx: PluginContext,
  message: string,
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(fn, {
    ...options,
    onRetry: async (attempt, error) => {
      ctx.ui?.warn(`${message} failed: ${error.message}`);
      ctx.ui?.info(`Retrying (${attempt}/${options.maxRetries ?? 3})...`);

      if (options.onRetry) {
        await options.onRetry(attempt, error);
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sleep for specified duration.
 *
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Timeout wrapper - reject if function takes too long.
 *
 * @param fn - Function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Function result or timeout error
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   async () => await slowOperation(),
 *   5000 // 5 seconds
 * );
 * ```
 */
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    sleep(timeoutMs).then(() => {
      throw new Error(`Operation timed out after ${timeoutMs}ms`);
    }),
  ]);
}

/**
 * Debounce function - wait for calls to stop before executing.
 * Useful for rate-limited APIs or expensive operations.
 *
 * @param fn - Function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced function
 *
 * @example
 * ```typescript
 * const debouncedSave = debounce(
 *   async (data) => await saveToDatabase(data),
 *   1000
 * );
 *
 * // Only last call will execute
 * debouncedSave(data1);
 * debouncedSave(data2);
 * debouncedSave(data3); // Only this one executes
 * ```
 */
export function debounce<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve, reject) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delayMs);
    });
  };
}

/**
 * Throttle function - execute at most once per interval.
 * Useful for rate-limited APIs.
 *
 * @param fn - Function to throttle
 * @param intervalMs - Minimum interval between calls
 * @returns Throttled function
 *
 * @example
 * ```typescript
 * const throttledLog = throttle(
 *   async (message) => await sendToAPI(message),
 *   5000
 * );
 *
 * // Only executes once per 5 seconds
 * throttledLog('msg1'); // Executes immediately
 * throttledLog('msg2'); // Ignored (within 5s)
 * // ... 5s later ...
 * throttledLog('msg3'); // Executes
 * ```
 */
export function throttle<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  intervalMs: number
): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
  let lastCall = 0;

  return async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
    const now = Date.now();

    if (now - lastCall >= intervalMs) {
      lastCall = now;
      return fn(...args);
    }

    return undefined;
  };
}
