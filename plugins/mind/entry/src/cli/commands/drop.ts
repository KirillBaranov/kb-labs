import { defineCommand, handleError, confirmDestructive, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { CommandResult } from '@kb-labs/sdk';
import { DropRequestSchema, type DropFlags, type DropResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

type DropResult = CommandResult<DropResponse>;

export default defineCommand<unknown, CLIInput<DropFlags>, DropResponse>({
  id: 'mind:drop',
  description: 'Drop an entire index — remove all its vectors and its manifest',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DropFlags>): Promise<DropResult> {
      const { flags } = input;
      const json = flags.json;
      try {
        // Destructive: blocks in EVERY mode until --yes (agents get a structured
        // confirmationRequired signal with severity/recovery, not a silent drop).
        const blocked = confirmDestructive(ctx, {
          confirmed: flags.yes,
          isJson: json,
          action: {
            action: 'mind drop',
            resource: `index "${flags.index}"`,
            effect: 'deletes all vectors and the manifest',
            severity: 'high',
            reversible: true,
            recovery: 'rebuild with `kb mind index --index <id> --full`',
            blastRadius: { scope: 'whole index' },
          },
        });
        if (blocked) {
          return blocked;
        }
        const req = DropRequestSchema.parse({ indexId: flags.index });
        const mind = await buildMind(ctx.cwd);
        const res = await mind.drop(req);

        if (json) {
          ctx.ui?.json?.(res);
          return { ok: true, result: res };
        }
        ctx.ui?.success?.(
          `Dropped "${res.indexId}" — removed ${res.droppedChunks} vector(s), ${res.droppedFiles} doc(s)`,
        );
        return { ok: true, result: res };
      } catch (err) {
        handleError(ctx, err, json);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
