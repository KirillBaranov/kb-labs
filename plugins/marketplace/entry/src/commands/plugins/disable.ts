import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { patch } from '../../http.js';

interface DisableInput { argv?: string[] }

export default defineCommand<unknown, DisableInput, { packageId: string }>({
  id: 'marketplace:plugins:disable',
  description: 'Disable a plugin',

  handler: {
    async execute(ctx: PluginContextV3, input: DisableInput): Promise<CommandResult<{ packageId: string }>> {
      const packageId = input.argv?.[0];
      if (!packageId) {
        ctx.ui?.error?.('Specify a plugin to disable');
        return { exitCode: 1, result: { packageId: '' } };
      }
      await patch(`/packages/${encodeURIComponent(packageId)}`, { enabled: false });
      ctx.ui?.success?.(`Disabled ${packageId}`);
      return { exitCode: 0, result: { packageId } };
    },
  },
});
