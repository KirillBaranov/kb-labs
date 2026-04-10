import type { RegisteredCommand } from './types';

/**
 * Execute a registered command.
 *
 * - Unavailable commands return exit code 2.
 * - Available commands are executed via manifest.loader().
 */
export async function runCommand(
  cmd: RegisteredCommand,
  ctx: any,
  argv: string[],
  flags: Record<string, any>,
): Promise<number> {
  if (!cmd.available) {
    if (ctx.presenter?.json) {
      ctx.presenter.json({
        ok: false,
        available: false,
        command: cmd.manifest.id,
        reason: cmd.unavailableReason,
        hint: cmd.hint,
      });
    }
    return 2;
  }

  if (!cmd.manifest.loader) {
    return 1;
  }

  const implementation = await cmd.manifest.loader();
  const result = await implementation.run(ctx, argv, flags);

  return typeof result === 'number' ? result : 0;
}
