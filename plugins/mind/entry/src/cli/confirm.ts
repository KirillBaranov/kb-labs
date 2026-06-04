import { type PluginContextV3 } from '@kb-labs/sdk';

/**
 * Software confirmation gate for destructive, irreversible operations.
 *
 * The `--yes` requirement holds in EVERY mode — including `--json`/agent use.
 * Without `--yes` the command does NOT run; instead it surfaces a clear signal:
 *   - human (text): a warning that the action cannot be undone;
 *   - agent (json): a single-line, machine-readable object the caller can act on
 *     (`requiresConfirmation: true`, `irreversible: true`) — so the agent pauses
 *     and asks for confirmation rather than silently destroying data.
 *
 * Returns the command result to return immediately when blocked, or `null` when
 * confirmed (`--yes`) so the caller proceeds.
 */
export function requireConfirmation(
  ctx: PluginContextV3,
  opts: { yes: boolean; json: boolean; action: string; target: string; what: string },
): { exitCode: number } | null {
  if (opts.yes) {
    return null;
  }
  const message =
    `${opts.action} permanently removes ${opts.what}. This action CANNOT be undone. ` +
    `Re-run with --yes to confirm.`;
  if (opts.json) {
    console.log(
      JSON.stringify({
        ok: false,
        requiresConfirmation: true,
        irreversible: true,
        action: opts.action,
        target: opts.target,
        message,
        confirmWith: '--yes',
      }),
    );
  } else {
    ctx.ui?.warn?.(message);
  }
  return { exitCode: 1 };
}
