export type ProcessErrorCode =
  | 'PROCESS_TIMEOUT'
  | 'PROCESS_CANCELLED'
  | 'PROCESS_MEMORY_LIMIT'
  | 'PROCESS_CPU_LIMIT'
  | 'PROCESS_LIMIT'
  | 'PROCESS_OUTPUT_LIMIT'
  | 'PROCESS_ADMISSION_TIMEOUT'
  | 'PROCESS_SPAWN_FAILED';

export class GovernedProcessError extends Error {
  readonly code: ProcessErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ProcessErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'GovernedProcessError';
    this.code = code;
    this.details = details;
  }
}
