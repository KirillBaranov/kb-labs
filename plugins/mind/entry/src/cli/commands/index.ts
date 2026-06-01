import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { type IndexFlags } from '@kb-labs/mind-contracts';
import { type IngestProgress } from '@kb-labs/mind-core';
import { buildMind } from '../../platform';

/**
 * Staged-progress renderer for `mind index`.
 *
 * Prints milestone lines via `ctx.ui.info` — which always renders (console.log
 * fallback), unlike `ctx.ui.spinner`, whose object is a no-op when the CLI
 * presenter has no spinner (the common `kb` execution path). The embed counter
 * is throttled to 25% buckets so a large corpus emits ~4 lines, not one per
 * batch. Each line is prefixed with elapsed seconds.
 */
function makeProgressReporter(ctx: PluginContextV3): (e: IngestProgress) => void {
  const startedAt = Date.now();
  const line = (msg: string) => ctx.ui?.info?.(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${msg}`);
  let embedBucket = -1;
  return (e: IngestProgress) => {
    switch (e.stage) {
      case 'discover':
        line(`Discovered ${e.files} file(s)`);
        break;
      case 'delta':
        line(`Delta: ${e.toIndex} to (re)index · ${e.unchanged} unchanged · ${e.removed} removed`);
        break;
      case 'chunk':
        line(`Chunked → ${e.chunks} chunk(s)`);
        break;
      case 'embed': {
        const bucket = e.total === 0 ? 4 : Math.floor((e.done / e.total) * 4); // 0..4 (25% steps)
        if (bucket > embedBucket || e.done === e.total) {
          embedBucket = bucket;
          line(`Embedding ${e.done}/${e.total} chunk(s)…`);
        }
        break;
      }
      case 'upsert':
        line(`Upserting ${e.count} vector(s)…`);
        break;
      case 'save':
        line('Saving index manifest…');
        break;
    }
  };
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
        // streams staged progress + elapsed time so a long index isn't a silent hang.
        const res = await mind.index(
          { indexId: flags.index, scope: flags.scope, full: flags.full },
          flags.json ? undefined : makeProgressReporter(ctx),
        );

        if (flags.json) {
          ctx.ui?.json?.(res);
          return { exitCode: 0 };
        }
        ctx.ui?.success?.(
          `Indexed ${res.filesIndexed} file(s), ${res.chunks} chunk(s) into "${res.indexId}" (${res.durationMs}ms)`,
        );
        return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1 };
      }
    },
  },
});
