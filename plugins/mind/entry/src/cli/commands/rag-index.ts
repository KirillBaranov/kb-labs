/**
 * Mind rag-index command - build Mind indexes (V3)
 */

import { defineCommand, useConfig, usePlatform, useLoader, type PluginContextV3 } from '@kb-labs/sdk';
import { runRagIndex } from '../../features/rag';

interface RagIndexInput {
  argv: string[];
  flags: {
    cwd?: string;
    scope?: string;
    include?: string;
    exclude?: string;
    skipDeduplication?: boolean;
    json?: boolean;
    quiet?: boolean;
  };
}

interface RagIndexResult {
  exitCode: number;
  ok: boolean;
  scopes?: string[];
  adapters?: {
    vectorStore: string;
    embeddings: string;
    storage: string;
    llm: string;
    cache: string;
  };
}

export default defineCommand({
  id: 'mind:rag-index',
  description: 'Build Mind indexes',

  handler: {
    async execute(ctx: PluginContextV3, input: RagIndexInput): Promise<RagIndexResult> {
      const startTime = Date.now();
      const { flags } = input;

      // Get Mind config using useConfig() helper
      const mindConfig = await useConfig();

      const cwd = flags.cwd || ctx.cwd;
      const scopeId = flags.scope;
      const include = flags.include;
      const exclude = flags.exclude;
      const skipDeduplication = flags.skipDeduplication;

      // Get platform for analytics (not passed to Mind - child process uses usePlatform())
      const platform = usePlatform();

      // Use loader for visual feedback (unless quiet/json mode)
      const loader = !flags.quiet && !flags.json ? useLoader('Building Mind RAG index...') : null;
      loader?.start();

      try {
        // Pass mindConfig from useConfig() - avoids reloading config in child process
        // IMPORTANT: Pass platform so Mind engine uses wrapped adapters with analytics tracking
        const result = await runRagIndex({
          cwd,
          scopeId,
          include,
          exclude,
          skipDeduplication,
          config: mindConfig,
          platform,
        });

        const timing = Date.now() - startTime;
        loader?.succeed(`Index built in ${(timing / 1000).toFixed(1)}s`);

        // Track analytics if available (runs in parent process)
        platform?.analytics?.track?.('mind.rag-index', {
          scopeIds: result.scopeIds,
          stats: result.stats,
        }).catch(() => {});

        if (flags.json) {
          ctx.ui.json({
            ok: true,
            scopes: result.scopeIds,
            stats: result.stats,
            adapters: result.adapters,
            timingMs: timing,
          });
        } else if (!flags.quiet) {
          const { stats } = result;
          const percentage = stats.filesDiscovered > 0
            ? ((stats.filesProcessed / stats.filesDiscovered) * 100).toFixed(1)
            : '0.0';
          const chunksPerFile = stats.filesProcessed > 0
            ? (stats.chunksStored / stats.filesProcessed).toFixed(2)
            : '0.00';

          ctx.ui.success(
            `Indexed ${stats.filesProcessed} files, ${stats.filesSkipped} skipped, ${stats.chunksStored} chunks, deleted ${stats.deletedFiles ?? 0} files/${stats.deletedChunks ?? 0} chunks`,
            {
              title: 'Mind RAG Index',
              sections: [
                {
                  header: 'Files',
                  items: [
                    `Discovered: ${stats.filesDiscovered}`,
                    `Processed:  ${stats.filesProcessed} (${percentage}%)`,
                    `Skipped:    ${stats.filesSkipped}`,
                  ],
                },
                {
                  header: 'Chunks',
                  items: [
                    `Stored: ${stats.chunksStored}`,
                    `Updated: ${stats.chunksUpdated}`,
                    `Skipped: ${stats.chunksSkipped}`,
                    `Rate:   ${chunksPerFile}/file`,
                  ],
                },
                {
                  header: 'Cleanup',
                  items: [
                    `Deleted files:  ${stats.deletedFiles ?? 0}`,
                    `Deleted chunks: ${stats.deletedChunks ?? 0}`,
                    `Invalid chunks: ${stats.invalidChunks ?? 0}`,
                  ],
                },
                {
                  header: 'Health',
                  items: [
                    `Errors: ${stats.errorCount}`,
                  ],
                },
              ],
              timing,
            }
          );
        }

        return {
          exitCode: 0,
          ok: true,
          scopes: result.scopeIds,
          adapters: result.adapters,
        };
      } catch (error) {
        const timing = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        loader?.fail(`Index build failed: ${message}`);

        if (flags.json) {
          ctx.ui.info(JSON.stringify({
            ok: false,
            error: message,
            timingMs: timing,
          }));
        } else if (!flags.quiet) {
          ctx.ui.error(`Index build failed: ${message}`);
        }

        // Track analytics
        platform?.analytics?.track?.('mind.rag-index', {
          error: true,
          errorMessage: message,
          timingMs: timing,
        }).catch(() => {});

        return { exitCode: 1, ok: false };
      }
    },
  },
});
