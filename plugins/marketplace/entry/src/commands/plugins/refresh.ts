import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';

interface RefreshFlags {
  json?: boolean;
}

export default defineCommand<unknown, CLIInput<RefreshFlags>, { exitCode: number }>({
  id: 'marketplace:plugins:refresh',
  description: 'Clear CLI discovery cache',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RefreshFlags>): Promise<{ exitCode: number }> {
      const { flags = {} } = input;

      try {
        const cacheFile = path.join(ctx.cwd, '.kb', 'cache', 'cli-manifests.json');
        let cleared = false;
        try {
          await fs.unlink(cacheFile);
          cleared = true;
        } catch {
          // file may not exist
        }

        if (flags.json) {
          ctx.ui?.json?.({ cleared });
        } else {
          ctx.ui?.success?.(
            cleared
              ? 'CLI discovery cache cleared. Run any kb command to rebuild.'
              : 'CLI discovery cache was already empty.',
          );
        }
        return { exitCode: 0 };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { exitCode: 1 };
      }
    },
  },
});
