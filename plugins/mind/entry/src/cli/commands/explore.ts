import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { ExploreRequestSchema, type ExploreFlags, type ExploreResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

type ExploreResult = { exitCode: number; result?: ExploreResponse };

export default defineCommand<unknown, CLIInput<ExploreFlags>, ExploreResponse>({
  id: 'mind:explore',
  description: 'Task-orientation map — where to start and how involved a task looks',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ExploreFlags>): Promise<ExploreResult> {
      const { flags } = input;
      const json = flags.format === 'json' || flags.json;
      try {
        const req = ExploreRequestSchema.parse({
          task: flags.task,
          indexId: flags.index,
          limit: flags.limit,
        });

        const mind = await buildMind(ctx.cwd);
        const res = await mind.explore(req);

        if (json) {
          // Single compact line so the agent contract `… --format json | grep "^{"`
          // works (ctx.ui.json pretty-prints, which breaks line-based extraction).
          console.log(JSON.stringify(res));
          return { exitCode: 0, result: res };
        }
        if (res.files.length === 0) {
          ctx.ui?.warn?.(`No relevant files in index "${res.indexId}"`);
        } else {
          ctx.ui?.success?.(
            `${res.files.length} file(s) across ${res.meta.spread} dir(s) — confidence ${res.confidence.toFixed(2)}`,
            {
              sections: [
                ...(res.summary ? [{ header: 'Orientation', items: [res.summary] }] : []),
                {
                  header: `Index "${res.indexId}"`,
                  items: res.files.map((f) => {
                    const loc = `${f.file}:${f.lines[0]}-${f.lines[1]}`;
                    const tags = `[${f.matchedBy}${f.stale ? ', stale' : ''}]`;
                    return `${loc} ${tags}\n    ${f.why}`;
                  }),
                },
              ],
            },
          );
        }
        return { exitCode: 0, result: res };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1 };
      }
    },
  },
});
