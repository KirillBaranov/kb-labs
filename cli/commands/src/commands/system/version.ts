import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';

type VersionFlags = {
  json: { type: 'boolean'; description?: string };
};

type VersionResult = CommandResult & {
  version: string;
  nodeVersion: string;
  platform: string;
};

export const version = defineSystemCommand<VersionFlags, VersionResult>({
  name: 'version',
  description: 'Show CLI version',
  longDescription: 'Displays the current version of the KB Labs CLI',
  category: 'info',
  examples: generateExamples('version', 'kb', [
    { flags: {} },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'version',
    startEvent: 'VERSION_STARTED',
    finishEvent: 'VERSION_FINISHED',
  },
  async handler(ctx, argv, flags) {
    const v = (ctx as any)?.cliVersion ?? (ctx as any)?.env?.CLI_VERSION ?? '0.0.0';
    const cliVersion = String(v);
    const nodeVersion = process.version;
    const platform = `${process.platform} ${process.arch}`;

    ctx.platform?.logger?.info('Version command executed', {
      version: cliVersion,
      nodeVersion,
      platform
    });

    // Output via ctx.ui (pure PluginContextV3)
    if (!flags.json) {
      ctx.ui?.write(`KB Labs CLI v${cliVersion}\n`);
      ctx.ui?.write(`Node: ${nodeVersion}\n`);
      ctx.ui?.write(`Platform: ${platform}\n`);
    } else {
      ctx.ui?.json({
        version: cliVersion,
        nodeVersion,
        platform,
      });
    }

    return {
      ok: true,
      version: cliVersion,
      nodeVersion,
      platform,
    };
  },
});
