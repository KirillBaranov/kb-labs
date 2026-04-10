/**
 * @module @kb-labs/core-sandbox/runner/execution/handler-loader
 * Load handler modules via ES module import
 */

import type { HandlerRef } from '../../types/index';
import type { Output } from '@kb-labs/core-sys/output';
import { SANDBOX_ERROR_CODES } from '../../errors/error-codes';

export interface HandlerLoaderOptions {
  handlerUrl: string;
  handlerRef: HandlerRef;
  output: Output;
  debugMode?: boolean;
}

export interface LoadedHandler {
  /** The handler function to execute */
  handlerFn: (...args: any[]) => Promise<unknown>;
  /** The loaded module (for debugging) */
  module: Record<string, unknown>;
}

/**
 * Load handler module and extract handler function
 *
 * @param options - Loader options
 * @returns Loaded handler function and module
 * @throws Error if module import fails or handler not found
 */
export async function loadHandler(options: HandlerLoaderOptions): Promise<LoadedHandler> {
  const { handlerUrl, handlerRef, output, debugMode = false } = options;

  // Load handler module
  let handlerModule: Record<string, unknown>;
  try {
    handlerModule = await import(handlerUrl) as Record<string, unknown>;
  } catch (importError: unknown) {
    const error = importError instanceof Error ? importError : new Error(String(importError));
    output.error(`Failed to import handler module: ${error.message}`, {
      code: SANDBOX_ERROR_CODES.HANDLER_IMPORT_FAILED,
    });
    if (error.stack) {
      output.debug(`Import error stack: ${error.stack}`);
    }
    throw error;
  }

  const handlerFn = handlerModule[handlerRef.export];

  if (!handlerFn || typeof handlerFn !== 'function') {
    const errorMsg = `Handler ${handlerRef.export} not found or not a function in ${handlerRef.file}`;
    output.error(errorMsg, {
      code: SANDBOX_ERROR_CODES.HANDLER_NOT_FOUND,
    });
    if (debugMode) {
      output.debug(`Available exports: ${Object.keys(handlerModule).join(', ')}`);
    }
    throw new Error(errorMsg);
  }

  return {
    handlerFn: handlerFn as (...args: any[]) => Promise<unknown>,
    module: handlerModule,
  };
}
