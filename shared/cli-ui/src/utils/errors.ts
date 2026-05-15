interface ErrorContext {
  ui?: {
    json?: (data: unknown) => void;
    error?: (message: string, opts?: Record<string, unknown>) => void;
  };
}

/**
 * Structured validation error — emits { ok: false, error: { code: 'INVALID_ARGS', ... } } in JSON mode.
 * Call before try/catch, right before `return { exitCode: 1 }`.
 */
export function validationError(
  ctx: ErrorContext,
  message: string,
  hint?: string,
  isJson?: boolean,
): void {
  if (isJson) {
    ctx.ui?.json?.({ ok: false, error: { code: 'INVALID_ARGS', message, ...(hint && { hint }) } });
  } else {
    ctx.ui?.error?.(message, { ...(hint && { hint }) });
  }
}

/**
 * Structured runtime/API error — emits { ok: false, error: { code: 'INTERNAL_ERROR', ... } } in JSON mode.
 * Call in catch blocks, right before `return { exitCode: 1 }`.
 */
export function handleError(ctx: ErrorContext, err: unknown, isJson?: boolean): void {
  const message = err instanceof Error ? err.message : String(err);
  if (isJson) {
    ctx.ui?.json?.({ ok: false, error: { code: 'INTERNAL_ERROR', message } });
  } else {
    ctx.ui?.error?.(message);
  }
}

/**
 * Re-throws `err` as an HTTP-aware error for REST handlers.
 * Envelope middleware reads `err.statusCode` to set HTTP status.
 * If err already has statusCode — preserves it. Otherwise → 500.
 */
export function rethrowForRest(err: unknown): never {
  if (err !== null && typeof err === 'object' && 'statusCode' in err) {
    throw err;
  }
  const message = err instanceof Error ? err.message : String(err);
  throw Object.assign(new Error(message), {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
  });
}
