/**
 * @module @kb-labs/core-sandbox/types/handler-result
 * Handler result types for extensibility
 */

/**
 * Metadata passed to handler (future extensions)
 */
export interface HandlerMeta {
  /** Request metadata */
  request?: {
    startTime: number;
    headers?: Record<string, string>;
  };
  
  /** Future extensions */
  [key: string]: unknown;
}

/**
 * Handler result object with metadata
 */
export interface HandlerResultObject {
  exitCode: number;
  data?: unknown;
  metadata?: {
    progress?: number;
    duration?: number;
    [key: string]: unknown;
  };
}

/**
 * Handler result types (union for backwards compatibility)
 */
export type HandlerResult = 
  | number  // exit code (backwards compatible)
  | HandlerResultObject
  | AsyncIterable<any>;  // streaming (future)

/**
 * Normalize any result to HandlerResultObject
 */
export function normalizeHandlerResult(result: HandlerResult): HandlerResultObject {
  if (typeof result === 'number') {
    return { exitCode: result };
  }
  
  if (Symbol.asyncIterator in Object(result)) {
    // Streaming not yet supported, treat as success
    return { exitCode: 0, data: result };
  }
  
  return result as HandlerResultObject;
}





