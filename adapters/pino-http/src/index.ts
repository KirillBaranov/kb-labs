/**
 * @module @kb-labs/adapters-pino-http
 * Pino HTTP transport for streaming logs to REST API
 *
 * This transport receives logs from Pino, batches them, and sends to
 * REST API's /logs/ingest endpoint via HTTP POST.
 *
 * Features:
 * - Batching (configurable batch size and flush interval)
 * - Retry with exponential backoff
 * - Graceful shutdown (flushes pending logs before exit)
 * - Error handling (logs to stderr if HTTP fails)
 *
 * @example
 * ```typescript
 * import pino from 'pino';
 * import pinoHttp from '@kb-labs/adapters-pino-http';
 *
 * const logger = pino({
 *   transport: {
 *     target: '@kb-labs/adapters-pino-http',
 *     options: {
 *       url: 'http://localhost:5050/api/v1/logs/ingest',
 *       batchSize: 50,
 *       flushIntervalMs: 3000,
 *     },
 *   },
 * });
 *
 * logger.info('Hello from Pino HTTP Transport!');
 * ```
 */

import build from "pino-abstract-transport";

/**
 * Configuration for HTTP transport
 */
export interface HTTPTransportOptions {
  /** REST API URL for log ingestion (default: http://localhost:5050/api/v1/logs/ingest) */
  url?: string;

  /** Number of logs to batch before sending (default: 50) */
  batchSize?: number;

  /** Max time in ms to wait before flushing batch (default: 3000ms = 3s) */
  flushIntervalMs?: number;

  /** Number of retry attempts on HTTP failure (default: 3) */
  retryAttempts?: number;

  /** Initial retry delay in ms (default: 1000ms = 1s) */
  retryDelayMs?: number;

  /** Custom HTTP headers (e.g., for authentication) */
  headers?: Record<string, string>;

  /** Enable debug logging to stderr (default: false) */
  debug?: boolean;
}

/**
 * Create Pino HTTP transport
 *
 * This is the main export that Pino will call when loading the transport.
 * Pino expects a function that returns a Promise resolving to a writable stream.
 */
export default async function (opts: HTTPTransportOptions) {
  const config = {
    url: opts.url || "http://localhost:5050/api/v1/logs/ingest",
    batchSize: opts.batchSize || 50,
    flushIntervalMs: opts.flushIntervalMs || 3000,
    retryAttempts: opts.retryAttempts || 3,
    retryDelayMs: opts.retryDelayMs || 1000,
    headers: opts.headers || {},
    debug: opts.debug || false,
  };

  const batch: any[] = [];
  let flushTimer: NodeJS.Timeout | null = null;
  let isShuttingDown = false;

  /**
   * Send batch to REST API with retry logic
   */
  const flush = async (): Promise<void> => {
    if (batch.length === 0) {
      return;
    }

    // Copy batch and clear immediately to avoid blocking
    const logs = [...batch];
    batch.length = 0;

    if (config.debug) {
      console.error(`[PinoHTTP] Flushing ${logs.length} logs to ${config.url}`);
    }

    // Retry with exponential backoff
    for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
      try {
         
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...config.headers,
          },
          body: JSON.stringify(logs),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (config.debug) {
          console.error("[PinoHTTP] Flush successful");
        }

        return; // Success!
      } catch (error) {
        const isLastAttempt = attempt === config.retryAttempts - 1;

        if (isLastAttempt) {
          console.error("[PinoHTTP] Failed to send logs after retries:", error);
          return; // Give up after max retries
        }

        // Exponential backoff: 1s, 2s, 4s, 8s...
        const delayMs = config.retryDelayMs * Math.pow(2, attempt);

        if (config.debug) {
          console.error(
            `[PinoHTTP] Retry ${attempt + 1}/${config.retryAttempts} after ${delayMs}ms`,
          );
        }

         
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }
  };

  /**
   * Schedule next flush
   */
  const scheduleFlush = (): void => {
    if (flushTimer !== null) {
      return;
    } // Timer already scheduled

    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush(); // Fire and forget
    }, config.flushIntervalMs);
  };

  /**
   * Graceful shutdown: flush pending logs before exit
   */
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    if (config.debug) {
      console.error("[PinoHTTP] Shutting down, flushing pending logs...");
    }

    // Clear timer
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    // Flush remaining logs
    await flush();

    if (config.debug) {
      console.error("[PinoHTTP] Shutdown complete");
    }
  };

  // Register shutdown handlers
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("beforeExit", shutdown);

  /**
   * Build abstract transport stream
   *
   * Pino will write log objects to this stream.
   * We batch them and send to HTTP endpoint.
   */
  return build(
    async (source) => {
      for await (const log of source) {
        if (isShuttingDown) {
          // Ignore new logs during shutdown
          continue;
        }

        // Add log to batch
        batch.push(log);

        // Immediate flush if batch is full
        if (batch.length >= config.batchSize) {
          if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          await flush();
        } else {
          // Schedule delayed flush
          scheduleFlush();
        }
      }
    },
    {
      // Close handler - flush remaining logs
      close: async () => {
        await shutdown();
      },
    },
  );
}
