import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../http.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface SyncFlags {
  'auto-enable'?: boolean;
  json?: boolean;
}

interface SyncInput {
  argv?: string[];
  flags?: SyncFlags;
}

interface SyncEntry {
  id: string;
  primaryKind: string;
  version: string;
}

interface SyncResultData {
  added: SyncEntry[];
  skipped: Array<{ id: string; reason: string }>;
  total: number;
}

export default defineCommand<unknown, SyncInput, SyncResultData>({
  id: 'marketplace:sync',
  description: 'Sync workspace — scan for entities and populate lock',

  handler: {
    async execute(ctx: PluginContextV3, input: SyncInput): Promise<CommandResult<SyncResultData>> {
      const flags = (input.flags ?? input) as SyncFlags;
      const cwd = ctx.cwd ?? process.cwd();
      const syncConfig = await loadSyncConfig(cwd);

      if (!syncConfig.include?.length) {
        ctx.ui?.error?.('No marketplace.sync.include in kb.config.json');
        return { exitCode: 1, result: { added: [], skipped: [], total: 0 } };
      }

      const isDev = (process.env.NODE_ENV ?? 'development') === 'development';
      const result = await post<SyncResultData>('/workspace/sync', {
        include: syncConfig.include,
        exclude: syncConfig.exclude,
        autoEnable: flags['auto-enable'] !== undefined ? Boolean(flags['auto-enable']) : isDev,
      });

      if (flags.json) {
        ctx.ui?.json?.(result);
      } else if (result.added.length === 0) {
        ctx.ui?.info?.(`Lock is up to date (${result.total} entries)`);
      } else {
        ctx.ui?.success?.(`Synced ${result.added.length} new entries (${result.total} total)`, {
          sections: [{
            header: 'Added',
            items: result.added.map(e => `+ ${e.id} (${e.primaryKind}) v${e.version}`),
          }],
        });
      }

      return { exitCode: 0, result };
    },
  },
});

async function loadSyncConfig(cwd: string): Promise<{ include?: string[]; exclude?: string[] }> {
  for (const p of [path.join(cwd, '.kb', 'kb.config.json'), path.join(cwd, 'kb.config.json')]) {
    try {
      const raw = await fs.readFile(p, 'utf-8');
      return JSON.parse(raw)?.marketplace?.sync ?? {};
    } catch { continue; }
  }
  return {};
}
