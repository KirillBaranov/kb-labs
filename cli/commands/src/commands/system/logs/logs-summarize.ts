/**
 * logs summarize — AI-powered log analysis.
 * Agent-first: ask a natural-language question about logs.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { platform } from '@kb-labs/core-runtime';
import { parseRelativeTime, computeLogStats } from './logs-utils';
import type { LogQuery, LogRecord } from '@kb-labs/core-platform';

type Flags = {
  from: { type: 'string'; description?: string };
  to: { type: 'string'; description?: string };
  level: { type: 'string'; description?: string };
  source: { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
};

/**
 * Build LLM prompt for log summarization (matches REST API pattern).
 */
function buildPrompt(question: string, logs: LogRecord[], stats: ReturnType<typeof computeLogStats>): string {
  let prompt = `You are analyzing application logs. User question: "${question}"\n\n`;

  prompt += `Statistics:\n`;
  prompt += `Total logs: ${stats.total}\n`;
  prompt += `Errors: ${stats.errors}\n`;
  prompt += `Warnings: ${stats.warnings}\n`;
  prompt += `Sources: ${stats.sources.join(', ')}\n`;

  if (stats.topErrors.length > 0) {
    prompt += `\nTop Errors:\n`;
    for (const [idx, err] of stats.topErrors.slice(0, 5).entries()) {
      prompt += `${idx + 1}. "${err.message}" (${err.count} occurrences) [${err.source}]\n`;
    }
  }

  // Add recent log entries (limit to 100)
  const recent = logs.slice(-100);
  prompt += `\nLog Entries (${recent.length} most recent):\n`;
  for (const log of recent) {
    const time = new Date(log.timestamp).toISOString();
    const msg = typeof log.message === 'string' ? log.message : JSON.stringify(log.message);
    prompt += `[${time}] ${log.level.toUpperCase()} [${log.source}]: ${msg}\n`;

    if (log.fields.err && (log.fields.err as any).stack) {
      const stack = String((log.fields.err as any).stack).split('\n').slice(0, 3).join('\n  ');
      prompt += `  stack: ${stack}\n`;
    }
  }

  prompt += `\nInstructions:\n`;
  prompt += `Provide a clear, concise summary answering the user's question. Focus on:\n`;
  prompt += `1. What happened (timeline of events)\n`;
  prompt += `2. Root causes if errors are present\n`;
  prompt += `3. Patterns or trends\n`;
  prompt += `4. Actionable recommendations if applicable\n`;
  prompt += `Keep under 300 words. Plain text, no markdown.\n`;

  return prompt;
}

/**
 * Generate fallback summary without LLM.
 */
function fallbackSummary(stats: ReturnType<typeof computeLogStats>): string {
  let summary = `Log Summary (statistical, LLM unavailable)\n\n`;
  summary += `Total: ${stats.total} logs (${stats.errors} errors, ${stats.warnings} warnings)\n`;

  if (stats.sources.length > 0) {
    summary += `\nBy Source:\n`;
    for (const [source, breakdown] of Object.entries(stats.bySource)) {
      summary += `  ${source}: ${breakdown.errors} errors, ${breakdown.warnings} warnings\n`;
    }
  }

  if (stats.topErrors.length > 0) {
    summary += `\nTop Errors:\n`;
    for (const [idx, err] of stats.topErrors.slice(0, 5).entries()) {
      summary += `  ${idx + 1}. "${err.message}" (${err.count}x) [${err.source}]\n`;
    }
  }

  return summary;
}

export const logsSummarize = defineSystemCommand<Flags, CommandResult>({
  name: 'summarize',
  description: 'AI-powered log analysis — ask a question about your logs',
  category: 'logs',
  examples: generateExamples('logs summarize', 'kb', [
    { flags: { json: true }, description: '"What errors happened in the last hour?"' },
    { flags: { from: '"30m"', source: 'rest' }, description: '"Why is the REST API failing?"' },
  ]),
  flags: {
    from: { type: 'string', description: 'Start time (default: "1h"). Relative: 1h, 30m, 2d' },
    to: { type: 'string', description: 'End time' },
    level: { type: 'string', description: 'Filter by level' },
    source: { type: 'string', description: 'Filter by source' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(_ctx, argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return { ok: false, error: 'Log reader not available. Ensure platform is initialized.' };
    }

    const question = argv[0] || 'What happened recently? Summarize errors and notable events.';

    const fromTs = flags.from ? parseRelativeTime(flags.from) : Date.now() - 3_600_000;
    const query: LogQuery = { from: fromTs };
    if (flags.to) {query.to = parseRelativeTime(flags.to);}
    if (flags.level) {query.level = flags.level as any;}
    if (flags.source) {query.source = flags.source;}

    const result = await reader.query(query, { limit: 1000, sortOrder: 'desc' });
    const stats = computeLogStats(result.logs);

    // Try AI summarization
    let aiSummary: string | null = null;
    let llmUsed = false;

    if (platform.llm) {
      try {
        const prompt = buildPrompt(question, result.logs, stats);
        const response = await platform.llm.complete(prompt, {
          temperature: 0.7,
          maxTokens: 1000,
          systemPrompt: 'You are a technical log analysis assistant. Provide clear, actionable insights based on application logs.',
        });
        aiSummary = response.content.trim();
        llmUsed = true;
      } catch {
        // Graceful fallback
        aiSummary = fallbackSummary(stats);
      }
    } else {
      aiSummary = fallbackSummary(stats);
    }

    return {
      ok: true,
      question,
      summary: aiSummary,
      llmUsed,
      stats: {
        total: stats.total,
        errors: stats.errors,
        warnings: stats.warnings,
        sources: stats.sources,
        topErrors: stats.topErrors,
      },
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      ctx.ui.json(result);
      return;
    }

    if (!result.ok) {
      ctx.ui.error('Log Summarize', { sections: [{ header: 'Error', items: [result.error ?? 'Unknown'] }] });
      return;
    }

    const data = result as any;
    ctx.ui.write(`Question: ${data.question}\n`);
    ctx.ui.write(`${data.llmUsed ? '(AI-powered)' : '(Statistical fallback)'}\n\n`);
    ctx.ui.write(data.summary + '\n');
  },
});
