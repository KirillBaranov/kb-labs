import { defineCommand, handleError, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { clearDiscoveryCache } from './plugins/refresh.js';

interface RehashFlags { json?: boolean }

/** Backwards-compatible maintenance command documented by older platform releases. */
export default defineCommand<unknown, CLIInput<RehashFlags>, { cleared: boolean }>({
  id: 'marketplace:rehash',
  description: 'Rebuild CLI and marketplace discovery hashes',
  handler: {
    async intent(_ctx: PluginContextV3) {
      return {
        summary: 'Rebuild CLI and marketplace discovery hashes',
        operations: [{ type: 'update' as const, resource: 'discovery-cache', details: { action: 'rehash' } }],
      };
    },
    async execute(ctx: PluginContextV3, input: CLIInput<RehashFlags>): Promise<CommandResult<{ cleared: boolean }>> {
      try {
        const cleared = await clearDiscoveryCache(ctx.cwd);
        const result = { cleared };
        if (input.flags?.json) { ctx.ui?.json?.(result); }
        else { ctx.ui?.success?.('Discovery hashes rebuilt. Run any kb command to repopulate the cache.'); }
        return { ok: true, result };
      } catch (err) {
        handleError(ctx, err, input.flags?.json);
        return { ok: false, error: err instanceof Error ? err.message : String(err), result: { cleared: false } };
      }
    },
  },
});
