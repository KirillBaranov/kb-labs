import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SearchRequestSchema, type SearchFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SearchFlags>, { exitCode: number }>({
  id: 'mind:search',
  description: 'Semantic + keyword search over a Mind index',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SearchFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      try {
        // Validate/normalize CLI flags into the wire request (also narrows enums).
        const req = SearchRequestSchema.parse({
          text: flags.text,
          indexId: flags.index,
          mode: flags.mode,
          intent: flags.intent,
          limit: flags.limit,
        });

        const mind = await buildMind(ctx.cwd);

        // `--agent` emits the frozen agent-response-v1 contract (consumed by
        // CLAUDE.md / task-rag skill). Only the JSON goes to stdout.
        if (flags.agent) {
          const agentRes = await mind.ask({ text: req.text, indexId: req.indexId, mode: req.mode });
          ctx.ui?.json?.(agentRes);
          return { exitCode: 0 };
        }

        const res = await mind.search(req);
        if (flags.json) {
          ctx.ui?.json?.(res);
          return { exitCode: 0 };
        }

        if (res.results.length === 0) {
          ctx.ui?.warn?.(`No results in index "${res.indexId}"`);
          return { exitCode: 0 };
        }

        ctx.ui?.success?.(`${res.results.length} result(s) — confidence ${res.confidence.toFixed(2)}`, {
          sections: [
            {
              header: `Index "${res.indexId}"`,
              items: res.results.map(
                (r) => `${r.file}${r.lines ? `:${r.lines[0]}-${r.lines[1]}` : ''}  (${r.score.toFixed(4)})`,
              ),
            },
          ],
        });
        return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, flags.json || flags.agent);
        return { exitCode: 1 };
      }
    },
  },
});
