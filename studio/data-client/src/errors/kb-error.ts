export class KBError extends Error {
  constructor(
    public code: string,
    override message: string,
    public status?: number,
    public override cause?: unknown
  ) {
    super(message);
    this.name = 'KBError';
  }
}

export const errorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  TIMEOUT: 'TIMEOUT',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  TOOL_ERROR: 'TOOL_ERROR',
} as const;

