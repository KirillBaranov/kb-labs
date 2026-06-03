import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type StatusFlags, type IndexSummary, type StatusResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<StatusFlags>, StatusResponse>({
  id: 'mind:status',
  description: 'Show Mind index status',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<StatusFlags>): Promise<{ exitCode: number; result?: StatusResponse }> {
      const { flags } = input;
      try {
        const mind = await buildMind(ctx.cwd);
        const res = await mind.status(flags.index);

        if (flags.json) {
          ctx.ui?.json?.(res);
          return { exitCode: 0, result: res };
        }

        if (res.indexes.length === 0) {
          ctx.ui?.warn?.('No indexes built yet. Run `kb mind index` first.');
          return { exitCode: 0, result: res };
        }

        ctx.ui?.success?.('Mind indexes', {
          sections: [
            {
              header: `${res.indexes.length} index(es)`,
              items: res.indexes.map(
                (i: IndexSummary) => `${i.indexId}: ${i.documents} doc(s), ${i.chunks} chunk(s)` +
                  (i.lastIndexedAt ? `, updated ${i.lastIndexedAt}` : ''),
              ),
            },
          ],
        });
        return { exitCode: 0, result: res };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1 };
      }
    },
  },
});
