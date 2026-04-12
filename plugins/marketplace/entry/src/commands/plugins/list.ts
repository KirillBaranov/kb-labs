import { defineCommand, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { get } from '../../http.js';

interface ListFlags { json?: boolean }
interface ListInput { argv?: string[]; flags?: ListFlags }

interface EntryRow {
  id: string;
  version: string;
  source: string;
  primaryKind: string;
  provides: string[];
  enabled: boolean;
}

interface ListResultData {
  entries: EntryRow[];
  total: number;
}

export default defineCommand<unknown, ListInput, ListResultData>({
  id: 'marketplace:plugins:list',
  description: 'List installed plugins',

  handler: {
    async execute(ctx: PluginContextV3, input: ListInput): Promise<CommandResult<ListResultData>> {
      const flags = (input.flags ?? input) as ListFlags;
      const data = await get<ListResultData>('/list', { kind: 'plugin' });

      if (flags.json) {
        ctx.ui?.json?.(data);
      } else {
        const enabled = data.entries.filter(e => e.enabled !== false).length;
        const disabled = data.total - enabled;
        ctx.ui?.success?.(`${data.total} plugins (${enabled} enabled, ${disabled} disabled)`, {
          sections: [{
            header: 'Plugins',
            items: data.entries.map(e => {
              const icon = e.enabled !== false ? '✅' : '⏸';
              return `${icon} ${e.id} ${e.version} (${e.source})`;
            }),
          }],
        });
      }

      return { exitCode: 0, result: data };
    },
  },
});
