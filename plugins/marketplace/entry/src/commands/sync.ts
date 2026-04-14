import { defineCommand, useEnv, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../scope.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface SyncFlags {
  'auto-enable'?: boolean;
  json?: boolean;
  scope?: string;
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

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          ctx.ui?.error?.(err.message);
          return { exitCode: 1, result: { added: [], skipped: [], total: 0 } };
        }
        throw err;
      }

      // Sync reads include/exclude patterns from the config file located at
      // the scope root, not from the CLI cwd. This keeps semantics consistent:
      // `--scope project` syncs using the project's config, `--scope platform`
      // uses the platform config.
      const configRoot = scopeCtx.scope === 'project' && scopeCtx.projectRoot
        ? scopeCtx.projectRoot
        : cwd;
      const syncConfig = await loadSyncConfig(configRoot);

      if (!syncConfig.include?.length) {
        ctx.ui?.error?.(`No marketplace.sync.include in ${configRoot}/.kb/kb.config.{json,jsonc}`);
        return { exitCode: 1, result: { added: [], skipped: [], total: 0 } };
      }

      const isDev = (useEnv('NODE_ENV') ?? 'development') === 'development';
      const result = await post<SyncResultData>('/workspace/sync', {
        include: syncConfig.include,
        exclude: syncConfig.exclude,
        autoEnable: flags['auto-enable'] !== undefined ? Boolean(flags['auto-enable']) : isDev,
        ...scopeBody(scopeCtx),
      });

      if (flags.json) {
        ctx.ui?.json?.(result);
      } else if (result.added.length === 0) {
        ctx.ui?.info?.(`Lock is up to date — ${scopeCtx.scope} (${result.total} entries)`);
      } else {
        ctx.ui?.success?.(`Synced ${result.added.length} new entries to ${scopeCtx.scope} (${result.total} total)`, {
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

async function loadSyncConfig(root: string): Promise<{ include?: string[]; exclude?: string[] }> {
  for (const name of ['kb.config.jsonc', 'kb.config.json']) {
    const p = path.join(root, '.kb', name);
    try {
      const raw = await fs.readFile(p, 'utf-8');
      return JSON.parse(stripJsonc(raw))?.marketplace?.sync ?? {};
    } catch { continue; }
  }
  return {};
}

/** Minimal JSONC stripper — removes // line and /* *\/ block comments plus trailing commas. */
function stripJsonc(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}
