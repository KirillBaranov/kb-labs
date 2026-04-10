/**
 * logs stats — Show log storage statistics and capabilities
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { platform } from '@kb-labs/core-runtime';

type Flags = {
  json: { type: 'boolean'; description?: string };
};

type Result = CommandResult & {
  capabilities?: object;
  buffer?: object;
  persistence?: object;
};

export const logsStats = defineSystemCommand<Flags, Result>({
  name: 'stats',
  description: 'Show log storage statistics and capabilities',
  category: 'logs',
  examples: generateExamples('logs stats', 'kb', [
    { flags: {} },
    { flags: { json: true } },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler() {
    const reader = platform.logs;
    if (!reader) {
      return { ok: false, error: 'Log reader not available. Ensure platform is initialized.' };
    }

    const stats = await reader.getStats();
    const caps = reader.getCapabilities();

    return {
      ok: true,
      capabilities: caps,
      buffer: stats.buffer ? {
        size: stats.buffer.size,
        maxSize: stats.buffer.maxSize,
        oldest: stats.buffer.oldestTimestamp ? new Date(stats.buffer.oldestTimestamp).toISOString() : null,
        newest: stats.buffer.newestTimestamp ? new Date(stats.buffer.newestTimestamp).toISOString() : null,
      } : undefined,
      persistence: stats.persistence ? {
        totalLogs: stats.persistence.totalLogs,
        oldest: stats.persistence.oldestTimestamp ? new Date(stats.persistence.oldestTimestamp).toISOString() : null,
        newest: stats.persistence.newestTimestamp ? new Date(stats.persistence.newestTimestamp).toISOString() : null,
        sizeBytes: stats.persistence.sizeBytes,
        sizeMB: Math.round(stats.persistence.sizeBytes / 1024 / 1024 * 100) / 100,
      } : undefined,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      ctx.ui.json(result);
      return;
    }

    if (!result.ok) {
      ctx.ui.error('Log Stats', { sections: [{ header: 'Error', items: [result.error ?? 'Unknown error'] }] });
      return;
    }

    const sections: Array<{ header: string; items: string[] }> = [];

    const caps = result.capabilities as any;
    if (caps) {
      sections.push({
        header: 'Capabilities',
        items: [
          `Ring Buffer: ${caps.hasBuffer ? 'yes' : 'no'}`,
          `Persistence (SQLite): ${caps.hasPersistence ? 'yes' : 'no'}`,
          `Full-Text Search: ${caps.hasSearch ? 'yes' : 'no'}`,
          `Real-Time Streaming: ${caps.hasStreaming ? 'yes' : 'no'}`,
        ],
      });
    }

    const buf = result.buffer as any;
    if (buf) {
      sections.push({
        header: 'Ring Buffer',
        items: [
          `Size: ${buf.size} / ${buf.maxSize}`,
          `Oldest: ${buf.oldest ?? 'empty'}`,
          `Newest: ${buf.newest ?? 'empty'}`,
        ],
      });
    }

    const pers = result.persistence as any;
    if (pers) {
      sections.push({
        header: 'Persistent Storage',
        items: [
          `Total Logs: ${pers.totalLogs}`,
          `Size: ${pers.sizeMB} MB`,
          `Oldest: ${pers.oldest ?? 'empty'}`,
          `Newest: ${pers.newest ?? 'empty'}`,
        ],
      });
    }

    ctx.ui.success('Log Storage Statistics', { sections });
  },
});
