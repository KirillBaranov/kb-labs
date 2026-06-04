import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { DropRequestSchema, type DropFlags, type DropResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

type DropResult = { exitCode: number; result?: DropResponse };

export default defineCommand<unknown, CLIInput<DropFlags>, DropResponse>({
  id: 'mind:drop',
  description: 'Drop an entire index — remove all its vectors and its manifest',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DropFlags>): Promise<DropResult> {
      const { flags } = input;
      const json = flags.json;
      try {
        // Destructive: require explicit confirmation in interactive use.
        if (!flags.yes && !json) {
          ctx.ui?.warn?.(
            `This permanently removes index "${flags.index}" (all vectors + manifest). ` +
              `Re-run with --yes to confirm.`,
          );
          return { exitCode: 1 };
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
