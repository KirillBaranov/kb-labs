import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { DropRequestSchema, type DropFlags, type DropResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';
import { requireConfirmation } from '../confirm';

type DropResult = { exitCode: number; result?: DropResponse };

export default defineCommand<unknown, CLIInput<DropFlags>, DropResponse>({
  id: 'mind:drop',
  description: 'Drop an entire index — remove all its vectors and its manifest',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DropFlags>): Promise<DropResult> {
      const { flags } = input;
      const json = flags.json;
      try {
        // Destructive + irreversible: blocks in EVERY mode until --yes (agents
        // get a machine-readable requiresConfirmation signal, not a silent drop).
        const blocked = requireConfirmation(ctx, {
          yes: flags.yes,
          json,
          action: 'mind drop',
          target: flags.index,
          what: `index "${flags.index}" (all its vectors + manifest)`,
        });
        if (blocked) {
          return blocked;
        }
        const req = DropRequestSchema.parse({ indexId: flags.index });
        const mind = await buildMind(ctx.cwd);
        const res = await mind.drop(req);

        if (json) {
          console.log(JSON.stringify(res));
          return { exitCode: 0, result: res };
        }
        ctx.ui?.success?.(
          `Dropped "${res.indexId}" — removed ${res.droppedChunks} vector(s), ${res.droppedFiles} doc(s)`,
        );
        return { exitCode: 0, result: res };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1 };
      }
    },
  },
});
