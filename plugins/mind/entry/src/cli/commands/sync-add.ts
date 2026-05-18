import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

interface SyncAddFlags {
  path: string;
  id?: string;
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
  id: 'mind:sync:add',
  description: 'Add a document path to the Mind sync registry',

  handler: {
    async intent(_ctx: PluginContextV3, input: { argv: string[]; flags: SyncAddFlags }) {
      const { path, id } = input.flags;
      return {
        summary: `Add path "${path ?? '(unknown)'}" to Mind sync registry`,
        operations: [{ type: 'create' as const, resource: 'sync-entry', details: { path, id } }],
      };
    },

    async execute(ctx: PluginContextV3, input: { argv: string[]; flags: SyncAddFlags }) {
      const { path: sourcePath, json } = input.flags;

      if (!sourcePath) {
        ctx.ui.error('--path is required');
        return { exitCode: 1 };
      }

      const registryPath = join(ctx.cwd, '.kb/mind/sync/sources.json');
      const entries = await readRegistry(registryPath);
      const id = input.flags.id ?? `src-${Date.now()}`;

      if (entries.some(e => e.path === sourcePath)) {
        ctx.ui.error(`Path "${sourcePath}" is already registered`);
        return { exitCode: 1 };
      }

      const entry: SyncEntry = { id, path: sourcePath, addedAt: new Date().toISOString() };
      entries.push(entry);

      try {
        await writeRegistry(registryPath, entries);
      } catch (err) {
        ctx.ui.error(`Failed to write registry: ${err instanceof Error ? err.message : String(err)}`);
        return { exitCode: 1 };
      }

      if (json) {
        ctx.ui.json?.({ id, path: sourcePath });
      } else {
        ctx.ui.success(`Added "${sourcePath}" to sync registry`, { hint: `Run \`kb mind sync list\` to see all sources.` });
      }

      return { exitCode: 0, result: entry };
    },
  },
});
