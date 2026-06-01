import { defineCommand, handleError, useLoader, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type IndexFlags } from '@kb-labs/mind-contracts';
import { type IngestProgress } from '@kb-labs/mind-core';
import { buildMind } from '../../platform';

/** Map an ingest stage to a one-line loader label. */
function stageText(e: IngestProgress): string {
  switch (e.stage) {
    case 'discover':
      return `Discovered ${e.files} file(s)`;
    case 'delta':
      return `Delta: ${e.toIndex} to (re)index · ${e.unchanged} unchanged · ${e.removed} removed`;
    case 'chunk':
      return `Chunked → ${e.chunks} chunk(s)`;
    case 'embed':
      return `Embedding ${e.done}/${e.total} chunk(s)`;
    case 'upsert':
      return `Upserting ${e.count} vector(s)`;
    case 'save':
      return 'Saving index manifest';
  }
}

export default defineCommand<unknown, CLIInput<IndexFlags>, { exitCode: number }>({
  id: 'mind:index',
  description: 'Build or refresh a Mind index from source files',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<IndexFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      try {
        const mind = await buildMind(ctx.cwd);

        // Built-in SDK loader: an animated spinner whose text we drive per stage
        // (writes to stdout directly, so it renders even though the CLI presenter
        // has no spinner). It self-suppresses in JSON mode, keeping stdout clean.
        const loader = flags.json ? undefined : useLoader(`Indexing "${flags.index ?? 'default'}"…`);
        loader?.start();

        const res = await mind.index(
          { indexId: flags.index, scope: flags.scope, full: flags.full },
          flags.json ? undefined : (e) => loader?.update({ text: stageText(e) }),
        );

        if (flags.json) {
          ctx.ui?.json?.(res);
          return { exitCode: 0 };
        }
        const summary = `Indexed ${res.filesIndexed} file(s), ${res.chunks} chunk(s) into "${res.indexId}" (${res.durationMs}ms)`;
        loader ? loader.succeed(summary) : ctx.ui?.success?.(summary);
        return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1 };
      }
    },
  },
});
