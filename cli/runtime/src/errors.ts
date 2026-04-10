export const CLI_ERROR_CODES = {
  E_IO_READ: "E_IO_READ",
  E_IO_WRITE: "E_IO_WRITE",
  E_ENV_MISSING_VAR: "E_ENV_MISSING_VAR",
  E_DISCOVERY_CONFIG: "E_DISCOVERY_CONFIG",
  E_TELEMETRY_EMIT: "E_TELEMETRY_EMIT",
  E_INVALID_FLAGS: "E_INVALID_FLAGS",
  E_PREFLIGHT_CANCELLED: "E_PREFLIGHT_CANCELLED",
} as const;

export type CliErrorCode =
  (typeof CLI_ERROR_CODES)[keyof typeof CLI_ERROR_CODES];

/**
 * Standard CLI exit codes (unified across all commands)
 * 0 = Success
 * 1 = Generic error (runtime, validation, etc.)
 * 2 = Preflight cancelled (git dirty, confirmation declined)
 * 3 = Invalid flags (bad flag values, missing required flags)
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1, // Generic errors, runtime failures
  PREFLIGHT_CANCELLED: 2, // User declined, git dirty check failed
  INVALID_FLAGS: 3, // Flag validation errors

  // Legacy sysexits.h codes (kept for compatibility)
  IO: 74, // EX_IOERR
  SOFTWARE: 70, // EX_SOFTWARE
  CONFIG: 78, // EX_CONFIG
} as const;

const ERROR_CODE_SET: Set<CliErrorCode> = new Set(
  Object.values(CLI_ERROR_CODES) as CliErrorCode[],
);

export const mapCliErrorToExitCode = (code: CliErrorCode): number => {
  switch (code) {
    case CLI_ERROR_CODES.E_INVALID_FLAGS:
      return EXIT_CODES.INVALID_FLAGS;

    case CLI_ERROR_CODES.E_PREFLIGHT_CANCELLED:
      return EXIT_CODES.PREFLIGHT_CANCELLED;

    case CLI_ERROR_CODES.E_DISCOVERY_CONFIG:
    case CLI_ERROR_CODES.E_ENV_MISSING_VAR:
      return EXIT_CODES.CONFIG;

    case CLI_ERROR_CODES.E_IO_READ:
    case CLI_ERROR_CODES.E_IO_WRITE:
      return EXIT_CODES.IO;

    case CLI_ERROR_CODES.E_TELEMETRY_EMIT:
      // treat as software/runtime unless clearly an IO failure in a sink
      return EXIT_CODES.SOFTWARE;

    default:
      return EXIT_CODES.ERROR;
  }
};

export class CliError extends Error {
  code: CliErrorCode;
  details?: unknown;

  constructor(code: CliErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;

    // сохраняем корректный stack при extends Error
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CliError);
    }
  }
}

export function isCliError(err: unknown): err is CliError {
  if (!err || typeof err !== "object") {
    return false;
  }
  // Check if it's an instance of CliError
  if (err instanceof CliError) {
    return true;
  }
  // For backwards compatibility, also check if it has the right structure
  const e = err as { code?: unknown; name?: string };
  return (
    e.name === "CliError" &&
    typeof e.code === "string" &&
    ERROR_CODE_SET.has(e.code as CliErrorCode)
  );
}

export function serializeCliError(
  err: unknown,
  opts: { includeStack?: boolean } = {},
): {
  name: string;
  message: string;
  code?: string;
  details?: unknown;
  stack?: string;
} {
  const includeStack = !!opts.includeStack;
  if (isCliError(err)) {
    return {
      name: "CliError",
      message: err.message,
      code: err.code,
      details: (err as any).details,
      ...(includeStack && err.stack ? { stack: err.stack } : {}),
    } as any;
  }
  const e = err as Error | undefined;
  return {
    name: e?.name || "Error",
    message: e?.message || String(err),
    ...(includeStack && e?.stack ? { stack: e.stack } : {}),
  } as any;
}
