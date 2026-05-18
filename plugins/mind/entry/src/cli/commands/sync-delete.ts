import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

interface SyncDeleteFlags {
  force?: boolean;
  json?: boolean;
  'dry-run'?: boolean;
}

interface SyncEntry {
  id: string;
  path: string;
  addedAt: string;
}

async function readRegistry(registryPath: string): Promise<SyncEntry[]> {
  try {
    const raw = await fsp.readFile(registryPath, 'utf-8');
    return JSON.parse(raw) as SyncEntry[];
  } catch {
    return [];
  }
}

async function writeRegistry(registryPath: string, entries: SyncEntry[]): Promise<void> {
  await fsp.mkdir(join(registryPath, '..'), { recursive: true });
  await fsp.writeFile(registryPath, JSON.stringify(entries, null, 2));
}

export default defineCommand({
  id: 'mind:sync:delete',
  description: 'Remove a document path from the Mind sync registry',

  handler: {
    async intent(_ctx: PluginContextV3, input: { argv: string[]; flags: SyncDeleteFlags }) {
      const [id] = input.argv;
      return {
        summary: `Delete sync entry ${id ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'sync-entry', details: { id } }],
      };
    },

    async execute(ctx: PluginContextV3, input: { argv: string[]; flags: SyncDeleteFlags }) {
      const [id] = input.argv;
      const { force, json } = input.flags;

      if (!id) {
        ctx.ui.error('Source ID is required');
        return { exitCode: 1 };
      }

      if (!force) {
        ctx.ui.warn(`This will remove sync entry "${id}". Pass --force to confirm.`);
        return { exitCode: 1 };
      }

      const registryPath = join(ctx.cwd, '.kb/mind/sync/sources.json');
      const entries = await readRegistry(registryPath);
      const before = entries.length;
      const filtered = entries.filter(e => e.id !== id);

      if (filtered.length === before) {
        ctx.ui.error(`Sync entry "${id}" not found`);
        return { exitCode: 1 };
      }

      try {
        await writeRegistry(registryPath, filtered);
      } catch (err) {
        ctx.ui.error(`Failed to write registry: ${err instanceof Error ? err.message : String(err)}`);
        return { exitCode: 1 };
      }

      if (json) {
        ctx.ui.json?.({ ok: true, deleted: true, id });
      } else {
        ctx.ui.success(`Removed sync entry "${id}"`);
      }

      return { exitCode: 0 };
    },
  },
});
