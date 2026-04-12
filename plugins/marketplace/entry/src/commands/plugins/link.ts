import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../../http.js';

interface LinkInput { argv?: string[] }

export default defineCommand<unknown, LinkInput, { id: string }>({
  id: 'marketplace:plugins:link',
  description: 'Link a local plugin for development',

  handler: {
    async execute(ctx: PluginContextV3, input: LinkInput): Promise<CommandResult<{ id: string }>> {
      const pluginPath = input.argv?.[0];
      if (!pluginPath) {
        ctx.ui?.error?.('Specify a plugin path to link');
        return { exitCode: 1, result: { id: '' } };
      }
      // POST /packages first to install/register the local path, then link it
      const result = await post<{ ok: boolean; id: string }>(`/packages/${encodeURIComponent(pluginPath)}/link`, { path: pluginPath });
      ctx.ui?.success?.(`Linked ${result.id}`);
      return { exitCode: 0, result: { id: result.id } };
    },
  },
});
