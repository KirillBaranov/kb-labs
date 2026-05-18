import { defineCommand, useEnv, validationError, handleError, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../http.js';
import { resolveCliScope, scopeBody, CliScopeError } from '../scope.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface SyncFlags {
  'auto-enable'?: boolean;
  json?: boolean;
  scope?: string;
  'dry-run'?: boolean;
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
    async intent(_ctx: PluginContextV3, _input: SyncInput) {
      return {
        summary: 'Sync workspace — scan for entities and populate lock file',
        operations: [
          { type: 'update' as const, resource: 'marketplace-lock', details: { action: 'sync-workspace' } },
        ],
      };
    },

    async execute(ctx: PluginContextV3, input: SyncInput): Promise<CommandResult<SyncResultData>> {
      const flags = (input.flags ?? input) as SyncFlags;
      const cwd = ctx.cwd ?? process.cwd();

      let scopeCtx;
      try {
        scopeCtx = await resolveCliScope(cwd, flags.scope);
      } catch (err) {
        if (err instanceof CliScopeError) {
          validationError(ctx, err.message, undefined, flags.json);
        } else {
          handleError(ctx, err, flags.json);
        }
        return { exitCode: 1, result: { added: [], skipped: [], total: 0 } };
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
        validationError(
          ctx,
          `No marketplace.sync.include configured.\n\nAdd to ${configRoot}/.kb/kb.config.json:\n\n  "marketplace": {\n    "sync": {\n      "include": ["plugins/*/entry", "plugins/*/core", "adapters/*"]\n    }\n  }`,
          undefined,
          flags.json,
        );
        return { exitCode: 1, result: { added: [], skipped: [], total: 0 } };
      }

      try {
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
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1, result: { added: [], skipped: [], total: 0 } };
      }
    },
  },
});

async function loadSyncConfig(root: string): Promise<{ include?: string[]; exclude?: string[] }> {
  for (const name of ['kb.config.jsonc', 'kb.config.json']) {
    const p = path.join(root, '.kb', name);
    try {
      const raw = await fs.readFile(p, 'utf-8');
      // .json files are strict JSON — strip only for .jsonc to avoid mangling URLs (e.g. ws://).
      const parsed = JSON.parse(name.endsWith('.jsonc') ? stripJsonc(raw) : raw);
      return parsed?.marketplace?.sync ?? {};
    } catch { continue; }
  }
  return {};
}

/** Minimal JSONC stripper — removes // line and /* block comments plus trailing commas. */
function stripJsonc(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}
