import type { PluginContextV3 } from '@kb-labs/sdk';
import { ClickUpApiError } from '@kb-labs/clickup-core';

export { validationError } from '@kb-labs/sdk';

function apiHint(err: ClickUpApiError): string {
  switch (err.status) {
    case 401: return 'CLICKUP_API_KEY is invalid or expired — check the token in your environment';
    case 403: return 'You don\'t have permission for this action in ClickUp — check workspace access';
    case 404: return 'Resource not found — verify the ID is correct (use `kb clickup workspace` to browse IDs)';
    case 429: return 'ClickUp rate limit reached — wait a moment and retry';
    default:  return 'Unexpected ClickUp API error';
  }
}

/**
 * Output a structured error and return — call right before `return { ok: false, error: 'Command failed', result: null }`.
 * In JSON mode emits `{ ok: false, error: { code, message, hint?, status? } }`.
 * In CLI mode uses ctx.ui.error() with hint and cause.
 */
export function handleError(ctx: PluginContextV3, err: unknown, isJson?: boolean): void {
  if (err instanceof ClickUpApiError) {
    const hint = apiHint(err);
    if (isJson) {
      ctx.ui?.json?.({ ok: false, error: { code: err.code, message: err.message, status: err.status, hint } });
    } else {
      ctx.ui?.error?.(err.message, { hint, cause: `ClickUp API ${err.status} (${err.code})` });
    }
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const isEnvMissing = /CLICKUP_API_KEY|CLICKUP_TEAM_ID/.test(message);

  if (isJson) {
    ctx.ui?.json?.({
      ok: false,
      error: {
        code: isEnvMissing ? 'ENV_MISSING' : 'INTERNAL_ERROR',
        message,
        ...(isEnvMissing && {
          hint: 'Set CLICKUP_API_KEY (and CLICKUP_TEAM_ID for workspace commands) as environment variables',
        }),
      },
    });
  } else {
    ctx.ui?.error?.(message, {
      ...(isEnvMissing && {
        hint: 'Set CLICKUP_API_KEY (and CLICKUP_TEAM_ID for workspace commands) as environment variables',
        command: 'export CLICKUP_API_KEY=pk_xxx CLICKUP_TEAM_ID=yyy',
      }),
    });
  }
}

/**
 * Re-throws `err` as an HTTP-aware error for REST handlers.
 * `ClickUpApiError` → preserves HTTP status code; env errors → 400; others → 500.
 * The envelope middleware in rest-api reads `err.statusCode` to set the response status.
 */
export function rethrowForRest(err: unknown): never {
  if (err instanceof ClickUpApiError) {
    const hint = apiHint(err);
    const restErr = Object.assign(new Error(err.message), {
      statusCode: err.status,
      code: err.code,
      details: { hint },
    });
    throw restErr;
  }
  const message = err instanceof Error ? err.message : String(err);
  const isEnvMissing = /CLICKUP_API_KEY|CLICKUP_TEAM_ID/.test(message);
  if (isEnvMissing) {
    throw Object.assign(new Error(message), {
      statusCode: 400,
      code: 'ENV_MISSING',
      details: { hint: 'Set CLICKUP_API_KEY (and CLICKUP_TEAM_ID for workspace commands) as environment variables' },
    });
  }
  throw err;
}
