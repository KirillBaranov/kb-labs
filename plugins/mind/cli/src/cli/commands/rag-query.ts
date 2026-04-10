/**
 * Mind rag-query command - semantic RAG search (V3)
 */

import { defineCommand, usePlatform, type PluginContextV3 } from '@kb-labs/sdk';
import { runRagQuery, runAgentRagQuery } from '../../features/rag';
import { isAgentError } from '@kb-labs/mind-orchestrator';

const VALID_INTENTS = ['summary', 'search', 'similar', 'nav'] as const;
const VALID_MODES = ['instant', 'auto', 'thinking'] as const;
const VALID_FORMATS = ['text', 'json', 'json-pretty'] as const;

function isValidIntent(intent: string): intent is (typeof VALID_INTENTS)[number] {
  return VALID_INTENTS.includes(intent as any);
}

function isValidMode(mode: string): mode is (typeof VALID_MODES)[number] {
  return VALID_MODES.includes(mode as any);
}

function isValidFormat(format: string): format is (typeof VALID_FORMATS)[number] {
  return VALID_FORMATS.includes(format as any);
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3)}...`;
}

interface RagQueryInput {
  argv: string[];
  flags: {
    cwd?: string;
    scope?: string;
    text?: string;
    intent?: string;
    limit?: number;
    profile?: string;
    mode?: string;
    format?: string;
    json?: boolean;
    quiet?: boolean;
    agent?: boolean;
    debug?: boolean;
  };
}

interface RagQueryResult {
  exitCode: number;
  ok: boolean;
  result?: any;
}

export default defineCommand({
  id: 'mind:rag-query',
  description: 'Run semantic RAG query on Mind index',

  handler: {
    async execute(ctx: PluginContextV3, input: RagQueryInput): Promise<RagQueryResult> {
      const startTime = Date.now();
      const { flags } = input;

      const cwd = flags.cwd || ctx.cwd;
      const scopeId = flags.scope;
      const intent = flags.intent && isValidIntent(flags.intent) ? flags.intent : undefined;
      const text = flags.text?.trim() || '';
      const limit = flags.limit ? Math.max(1, flags.limit) : undefined;
      const profileId = flags.profile;

      // Get platform for analytics (not passed to Mind - child process uses usePlatform())
      const platform = usePlatform();

      // Handle mode flag
      const mode = flags.mode && isValidMode(flags.mode) ? flags.mode : 'auto';

      // Handle format flag (with backward compatibility for --json)
      let format = flags.format && isValidFormat(flags.format) ? flags.format : 'text';
      if (flags.json && format === 'text') {
        format = 'json'; // Backward compatibility
      }

      if (!text) {
        if (flags.agent) {
          // Agent mode: output JSON error
          console.log(JSON.stringify({
            error: {
              code: 'INVALID_QUERY',
              message: 'Provide --text "<query>" to run rag:query.',
              recoverable: false,
            },
            meta: {
              schemaVersion: 'agent-response-v1',
              requestId: `rq-${Date.now()}`,
              mode: mode,
              timingMs: 0,
              cached: false,
            },
          }));

          ctx.trace?.addEvent?.('mind.rag-query.invalid', { reason: 'missing-text' });
          return { exitCode: 1, ok: false };
        }

        ctx.ui.error('Provide --text "<query>" to run rag:query.');
        ctx.ui.info('Use: kb mind rag-query --text "your query"');
        ctx.ui.info('Add --scope to search in specific scope');
        ctx.ui.info('Add --intent to specify intent (summary, search, similar, nav)');

        ctx.trace?.addEvent?.('mind.rag-query.invalid', { reason: 'missing-text' });
        return { exitCode: 1, ok: false };
      }

      // === AGENT MODE ===
      if (flags.agent) {
        try {
          const result = await runAgentRagQuery({
            cwd,
            scopeId,
            text,
            mode,
            debug: flags.debug,
            broker: undefined, // Gracefully falls back to in-memory
            platform, // Pass platform for analytics adapter
          });

          // Track analytics if available
          platform?.analytics?.track?.('mind.rag-query', {
            mode,
            agent: true,
            scopeId,
            intent,
          }).catch(() => {});

          // Output clean JSON to stdout
          console.log(JSON.stringify(result));

          // Return appropriate exit code
          if (isAgentError(result)) {
            return { exitCode: 1, ok: false, result };
          }
          return { exitCode: 0, ok: true, result };
        } catch (error) {
          // Output error as AgentErrorResponse
          const message = error instanceof Error ? error.message : String(error);
          console.log(JSON.stringify({
            error: {
              code: 'ENGINE_ERROR',
              message,
              recoverable: true,
            },
            meta: {
              schemaVersion: 'agent-response-v1',
              requestId: `rq-${Date.now()}`,
              mode: mode,
              timingMs: Date.now() - startTime,
              cached: false,
            },
          }));

          ctx.trace?.addEvent?.('mind.rag-query.agent.error', { error: message });
          return { exitCode: 1, ok: false };
        }
      }

      // === STANDARD MODE ===
      if (!flags.quiet && format === 'text') {
        ctx.ui.info('Initializing Mind RAG query...');
      }

      // Helper to format elapsed time
      const formatElapsedTime = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) {
          return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
      };

      // Track current stage
      let currentStage = 'Initializing';
      let lastProgressTime = Date.now();

      try {
        const result = await runRagQuery({
          cwd,
          scopeId,
          text,
          intent,
          limit,
          profileId,
          platform, // Pass platform for analytics adapter
          runtime: undefined, // Runtime context not available in CLI
          onProgress: (stage: string, details?: string) => {
            if (flags.quiet || format === 'json' || format === 'json-pretty') {return;}

            // Update current stage
            currentStage = details ? `${stage}: ${details}` : stage;

            // Throttle progress updates to once per second
            const now = Date.now();
            if (now - lastProgressTime >= 1000) {
              const elapsed = now - startTime;
              const elapsedStr = formatElapsedTime(elapsed);
              ctx.ui.info(`${currentStage} [${elapsedStr}]`);
              lastProgressTime = now;
            }
          },
        });

        const timing = Date.now() - startTime;

        ctx.trace?.addEvent?.('mind.rag-query.complete', {
          mode,
          scopeId,
          chunks: result.result.chunks.length,
          timingMs: timing,
        });

        // Output result
        if (format === 'json' || format === 'json-pretty') {
          // Check if we have the new JSON response format in metadata
          if (result.result.metadata?.jsonResponse) {
            const jsonResponse = result.result.metadata.jsonResponse;
            if (format === 'json-pretty') {
              ctx.ui.info(JSON.stringify(jsonResponse, null, 2));
            } else {
              ctx.ui.info(JSON.stringify(jsonResponse));
            }
          } else {
            // Fallback to old format for backward compatibility
            ctx.ui.info(JSON.stringify({
              ok: true,
              scopeId: result.scopeId,
              intent: result.result.query.intent,
              chunks: result.result.chunks,
              contextText: result.result.contextText,
            }));
          }
        } else if (!flags.quiet) {
          const topChunk = result.result.chunks[0];

          const sections: Array<{ header?: string; items: string[] }> = [
            {
              header: 'Summary',
              items: [
                `Scope: ${result.scopeId}`,
                `Intent: ${result.result.query.intent}`,
                `Chunks returned: ${result.result.chunks.length}`,
              ],
            },
          ];

          if (topChunk) {
            sections.push({
              header: 'Top chunk',
              items: [
                `${topChunk.path} #${topChunk.span.startLine}-${topChunk.span.endLine}`,
                truncateText(topChunk.text, 400),
              ],
            });
          } else {
            sections.push({
              items: ['No matching chunks found.'],
            });
          }

          // Show synthesized context if available (from reasoning chain)
          if (result.result.contextText && result.result.contextText.length > 0) {
            const contextPreview = result.result.contextText.length > 2000
              ? result.result.contextText.substring(0, 2000) + '...'
              : result.result.contextText;
            sections.push({
              header: `Synthesized context (${result.result.contextText.length} chars)`,
              items: [contextPreview],
            });
          }

          ctx.ui.success('Query completed', {
            title: 'Mind RAG Query',
            sections,
            timing,
          });
        }

        // Track analytics if available
        platform?.analytics?.track?.('mind.rag-query', {
          mode,
          agent: false,
          scopeId,
          intent,
        }).catch(() => {});

        return { exitCode: 0, ok: true, result };
      } catch (error) {
        const timing = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        ctx.trace?.addEvent?.('mind.rag-query.error', { error: message, timingMs: timing });

        if (format === 'json' || format === 'json-pretty') {
          ctx.ui.info(JSON.stringify({
            ok: false,
            error: message,
            timingMs: timing,
          }));
        } else if (!flags.quiet) {
          ctx.ui.error(`Query failed: ${message}`);
        }

        // Track analytics
        platform?.analytics?.track?.('mind.rag-query', {
          mode,
          agent: false,
          scopeId,
          intent,
          error: true,
        }).catch(() => {});

        return { exitCode: 1, ok: false };
      }
    },
  },
});
