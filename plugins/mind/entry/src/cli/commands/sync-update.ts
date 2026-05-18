import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

interface SyncUpdateFlags {
  path?: string;
  json?: boolean;
  'dry-run'?: boolean;
}

interface SyncEntry {
  id: string;
  path: string;
  addedAt: string;
  updatedAt?: string;
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
  id: 'mind:sync:update',
  description: 'Update a synced document path in the Mind sync registry',

  handler: {
    async intent(_ctx: PluginContextV3, input: { argv: string[]; flags: SyncUpdateFlags }) {
      const [id] = input.argv;
      return {
        summary: `Update sync entry ${id ?? '(unknown)'}`,
        operations: [{ type: 'update' as const, resource: 'sync-entry', details: { id, path: input.flags.path } }],
      };
    },

    async execute(ctx: PluginContextV3, input: { argv: string[]; flags: SyncUpdateFlags }) {
      const [id] = input.argv;
      const { path: newPath, json } = input.flags;

      if (!id) {
        ctx.ui.error('Source ID is required');
        return { exitCode: 1 };
      }

      if (!newPath) {
        ctx.ui.error('--path is required');
        return { exitCode: 1 };
      }

      const registryPath = join(ctx.cwd, '.kb/mind/sync/sources.json');
      const entries = await readRegistry(registryPath);
      const idx = entries.findIndex(e => e.id === id);

      if (idx === -1) {
        ctx.ui.error(`Sync entry "${id}" not found`);
        return { exitCode: 1 };
      }

      const updated: SyncEntry = { ...entries[idx]!, path: newPath, updatedAt: new Date().toISOString() };
      entries[idx] = updated;

      try {
        await writeRegistry(registryPath, entries);
      } catch (err) {
        ctx.ui.error(`Failed to write registry: ${err instanceof Error ? err.message : String(err)}`);
        return { exitCode: 1 };
      }

      if (json) {
        ctx.ui.json?.({ id, path: newPath });
      } else {
        ctx.ui.success(`Updated sync entry "${id}"`);
      }

      return { exitCode: 0, result: updated };
    },
  },
});
