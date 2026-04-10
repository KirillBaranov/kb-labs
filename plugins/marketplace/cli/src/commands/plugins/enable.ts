import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../../http.js';

interface EnableInput { argv?: string[] }

export default defineCommand<unknown, EnableInput, { packageId: string }>({
  id: 'marketplace:plugins:enable',
  description: 'Enable a plugin',

  handler: {
    async execute(ctx: PluginContextV3, input: EnableInput): Promise<CommandResult<{ packageId: string }>> {
      const packageId = input.argv?.[0];
      if (!packageId) {
        ctx.ui?.error?.('Specify a plugin to enable');
        return { exitCode: 1, result: { packageId: '' } };
      }
      await post('/enable', { packageId });
      ctx.ui?.success?.(`Enabled ${packageId}`);
      return { exitCode: 0, result: { packageId } };
    },
  },
});
