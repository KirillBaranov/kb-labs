/**
 * @module @kb-labs/core-sandbox/errors/error-codes
 * Centralized error codes for sandbox operations
 */

/**
 * Error codes used in sandbox bootstrap and execution
 */
export const SANDBOX_ERROR_CODES = {
    // Bootstrap errors
    BOOTSTRAP_IPC_FAILED: 'E_BOOTSTRAP_IPC_FAILED',
    CONTEXT_ERROR: 'E_CONTEXT_ERROR',
    CONTEXT_RECREATE_FAILED: 'E_CONTEXT_RECREATE_FAILED',
    
    // Handler errors
    HANDLER_IMPORT_FAILED: 'E_HANDLER_IMPORT_FAILED',
    HANDLER_NOT_FOUND: 'E_HANDLER_NOT_FOUND',
    HANDLER_EXECUTION_ERROR: 'E_HANDLER_EXECUTION_ERROR',
    HANDLER_EXECUTION_FAILED: 'E_HANDLER_EXECUTION_FAILED',
    HANDLER_EXIT_CODE: 'E_HANDLER_EXIT_CODE',
    
    // IPC errors
    IPC_UNAVAILABLE: 'E_IPC_UNAVAILABLE',
    IPC_SEND_FAILED: 'E_IPC_SEND_FAILED',
    INVALID_MESSAGE: 'E_INVALID_MESSAGE',
    MESSAGE_HANDLER_ERROR: 'E_MESSAGE_HANDLER_ERROR',
    
    // Runtime errors
    UNHANDLED_EXCEPTION: 'E_UNHANDLED_EXCEPTION',
    UNHANDLED_REJECTION: 'E_UNHANDLED_REJECTION',
} as const;

export type SandboxErrorCode = typeof SANDBOX_ERROR_CODES[keyof typeof SANDBOX_ERROR_CODES];


