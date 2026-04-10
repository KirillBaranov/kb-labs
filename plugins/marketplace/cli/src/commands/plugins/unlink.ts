import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../../http.js';

interface UnlinkInput { argv?: string[] }

export default defineCommand<unknown, UnlinkInput, { packageId: string }>({
  id: 'marketplace:plugins:unlink',
  description: 'Unlink a plugin',

  handler: {
    async execute(ctx: PluginContextV3, input: UnlinkInput): Promise<CommandResult<{ packageId: string }>> {
      const packageId = input.argv?.[0];
      if (!packageId) {
        ctx.ui?.error?.('Specify a package ID to unlink');
        return { exitCode: 1, result: { packageId: '' } };
      }
      await post('/unlink', { packageId });
      ctx.ui?.success?.(`Unlinked ${packageId}`);
      return { exitCode: 0, result: { packageId } };
    },
  },
});
