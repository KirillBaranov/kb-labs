import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SearchRequestSchema, type SearchFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<SearchFlags>, { exitCode: number }>({
  id: 'mind:search',
  description: 'Locate sources — fast retrieval over a Mind index (no LLM)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SearchFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const json = flags.format === 'json' || flags.json;
      try {
        // Validate/normalize CLI flags into the wire request (narrows enums).
        const req = SearchRequestSchema.parse({
          text: flags.text,
          indexId: flags.index,
          intent: flags.intent,
          limit: flags.limit,
          snippet: flags.snippet,
        });

        const mind = await buildMind(ctx.cwd);
        const res = await mind.search(req);

        if (json) {
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
              items: res.results.map((r) => {
                const loc = `${r.file}:${r.lines[0]}-${r.lines[1]}`;
                const tags = `[${r.matchedBy}${r.stale ? ', stale' : ''}]`;
                return r.snippet ? `${loc} ${tags}\n    ${r.snippet}` : `${loc} ${tags}`;
              }),
            },
          ],
        });
        return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1 };
      }
    },
  },
});
