import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type IndexFlags } from '@kb-labs/mind-contracts';
import { type IngestProgress } from '@kb-labs/mind-core';
import { buildMind } from '../../platform';

/** Render one ingest stage as a spinner line, prefixed with elapsed seconds. */
function renderProgress(
  spinner: { update?: (m: string) => void } | undefined,
  startedAt: number,
  e: IngestProgress,
): void {
  if (!spinner?.update) {
    return;
  }
  const el = ((Date.now() - startedAt) / 1000).toFixed(1);
  const at = `[${el}s]`;
  switch (e.stage) {
    case 'discover':
      spinner.update(`${at} Discovered ${e.files} file(s)`);
      break;
    case 'delta':
      spinner.update(`${at} Delta: ${e.toIndex} to (re)index · ${e.unchanged} unchanged · ${e.removed} removed`);
      break;
    case 'chunk':
      spinner.update(`${at} Chunked → ${e.chunks} chunk(s)`);
      break;
    case 'embed':
      spinner.update(`${at} Embedding ${e.done}/${e.total} chunk(s)…`);
      break;
    case 'upsert':
      spinner.update(`${at} Upserting ${e.count} vector(s)…`);
      break;
    case 'save':
      spinner.update(`${at} Saving index manifest…`);
      break;
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

        // JSON mode stays quiet (single machine-readable line); interactive mode
        // shows staged progress + elapsed time so a long index isn't a silent hang.
        const spinner = flags.json ? undefined : ctx.ui?.spinner?.(`Indexing "${flags.index ?? 'default'}"…`);
        const startedAt = Date.now();
        const res = await mind.index(
          { indexId: flags.index, scope: flags.scope, full: flags.full },
          flags.json ? undefined : (e) => renderProgress(spinner, startedAt, e),
        );

        if (flags.json) {
          ctx.ui?.json?.(res);
          return { exitCode: 0 };
        }
        const summary = `Indexed ${res.filesIndexed} file(s), ${res.chunks} chunk(s) into "${res.indexId}" (${res.durationMs}ms)`;
        spinner?.succeed ? spinner.succeed(summary) : ctx.ui?.success?.(summary);
        return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1 };
      }
    },
  },
});
