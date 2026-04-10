import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { post } from '../http.js';

interface UpdateInput {
  argv?: string[];
  flags?: { json?: boolean };
}

interface UpdateResultData {
  installed: Array<{ id: string; version: string; primaryKind: string }>;
  warnings: string[];
}

export default defineCommand<unknown, UpdateInput, UpdateResultData>({
  id: 'marketplace:update',
  description: 'Update marketplace package(s)',

  handler: {
    async execute(ctx: PluginContextV3, input: UpdateInput): Promise<CommandResult<UpdateResultData>> {
      const argv = input.argv ?? [];
      const result = await post<UpdateResultData>('/update', {
        packageIds: argv.length > 0 ? argv : undefined,
      });

      if (result.installed.length === 0) {
        ctx.ui?.info?.('Nothing to update');
      } else {
        ctx.ui?.success?.('Update completed', {
          sections: [{
            header: 'Updated',
            items: result.installed.map(p => `${p.id}@${p.version} (${p.primaryKind})`),
          }],
        });
      }

      return { exitCode: 0, result };
    },
  },
});
