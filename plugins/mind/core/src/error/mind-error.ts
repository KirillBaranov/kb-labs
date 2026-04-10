/**
 * @module @kb-labs/mind-core/error
 * Standardized error class for KB Labs Mind
 */

export class MindError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string,
    public meta?: any
  ) {
    super(message);
    this.name = 'MindError';
  }
}

/**
 * Maps MindError codes to CLI exit codes
 */
export function getExitCode(err: MindError): number {
  if (err.code === 'MIND_FORBIDDEN') {return 3;}
  if (err.code === 'MIND_NO_GIT') {return 2;}
  if (err.code === 'MIND_FS_TIMEOUT') {return 2;}
  if (err.code === 'MIND_PARSE_ERROR') {return 1;}
  if (err.code === 'MIND_PACK_BUDGET_EXCEEDED') {return 1;}
  if (err.code.startsWith('MIND_')) {return 1;}
  return 1;
}

/**
 * Error codes with their standard hints
 */
export const ERROR_HINTS = {
  MIND_NO_GIT: 'Initialize git repository or run from a git repository',
  MIND_FS_TIMEOUT: 'File system operation timed out - try increasing time budget',
  MIND_PARSE_ERROR: 'Failed to parse file - check syntax and try again',
  MIND_PACK_BUDGET_EXCEEDED: 'Context pack exceeds token budget - reduce content or increase budget',
  MIND_FORBIDDEN: 'Operation not permitted - check file permissions',
  MIND_TIME_BUDGET: 'Time budget exceeded - operation completed partially',
  MIND_BAD_FLAGS: 'Invalid command line flags - check values and try again',
  MIND_INVALID_FLAG: 'Invalid flag value - check format and try again',
  MIND_BUNDLE_TIMEOUT: 'Bundle operation timed out - skipped bundle information',
  MIND_FEED_ERROR: 'Mind feed operation failed - check logs for details',
  MIND_INIT_ERROR: 'Mind initialization failed - check permissions and try again',
  MIND_UPDATE_ERROR: 'Mind update operation failed - check logs for details',
  MIND_PACK_ERROR: 'Mind pack operation failed - check logs for details',
  MIND_GIT_ERROR: 'Git operation failed - check git repository status',
  MIND_INDEX_NOT_FOUND: 'Mind indexes not found - run "kb mind init" first',
  MIND_INVALID_PATH: 'Invalid file or directory path - check path exists and is accessible',
  MIND_DEPENDENCY_ERROR: 'Dependency resolution failed - check package configuration',
  MIND_BUILD_ERROR: 'Build operation failed - check configuration and try again',
} as const;

export type ErrorCode = keyof typeof ERROR_HINTS;

/**
 * Create a MindError with standardized code and hint
 */
export function createMindError(
  code: ErrorCode,
  message: string,
  meta?: any
): MindError {
  return new MindError(code, message, ERROR_HINTS[code], meta);
}

/**
 * Create a MindError from a generic error
 */
export function wrapError(error: unknown, code: ErrorCode = 'MIND_FEED_ERROR'): MindError {
  if (error instanceof MindError) {
    return error;
  }
  
  const message = error instanceof Error ? error.message : String(error);
  return createMindError(code, message, { originalError: error });
}

/**
 * Check if an error is a MindError
 */
export function isMindError(error: unknown): error is MindError {
  return error instanceof MindError;
}
