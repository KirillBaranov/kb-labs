import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { clearCache } from '../registry/plugins-state';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsCacheClearFlags = {
  deep: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
};

type PluginsCacheClearResult = CommandResult & {
  action?: string;
  files?: string[];
  modules?: string[];
  count?: number;
  modulesCount?: number;
};

export const pluginsCacheClear = defineSystemCommand<PluginsCacheClearFlags, PluginsCacheClearResult>({
  name: 'clear-cache',
  description: 'Clear CLI plugin discovery cache',
  category: 'marketplace',
  examples: ['kb marketplace clear-cache', 'kb marketplace clear-cache --deep'],
  flags: {
    deep: { type: 'boolean', description: 'Also clear Node.js module cache' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'marketplace:clear-cache',
    startEvent: 'MARKETPLACE_CACHE_CLEAR_STARTED',
    finishEvent: 'MARKETPLACE_CACHE_CLEAR_FINISHED',
  },
  async handler(ctx, _argv, flags) {
    const deep = flags.deep;
    const cwd = getContextCwd(ctx);
    const result = await clearCache(cwd, { deep });

    ctx.platform?.logger?.info('Cache cleared', {
      filesCount: result.files.length,
      modulesCount: result.modules?.length || 0,
      deep,
    });

    // Output handling
    if (flags.json) {
      const jsonResult = {
        ok: true,
        action: 'cache:clear',
        files: result.files,
        modules: result.modules,
        count: result.files.length,
        modulesCount: result.modules?.length || 0,
      };
      console.log(JSON.stringify(jsonResult, null, 2));
      return jsonResult;
    }

    // Build structured output
    const files = result.files ?? [];
    const modules = result.modules ?? [];

    const sections: Array<{ header?: string; items: string[] }> = [];

    // Cache files section
    if (files.length > 0) {
      sections.push({
        header: 'Cache Files',
        items: files.map((f) => `✓ ${f}`),
      });
    } else {
      sections.push({
        items: ['No cache files found'],
      });
    }

    // Modules section (if deep mode)
    if (deep && modules.length > 0) {
      sections.push({
        header: 'Node Modules',
        items: [`Cleared ${modules.length} module(s) from cache`],
      });
    }

    // Summary section
    sections.push({
      header: 'Summary',
      items: [`Removed ${files.length} file(s)${deep ? ` and ${modules.length} module(s)` : ''}`],
    });

    ctx.ui.success('', {
      title: '🗑️  Cache Management',
      sections,
    });

    return {
      ok: true,
      action: 'cache:clear',
      files: result.files,
      modules: result.modules,
      count: result.files.length,
      modulesCount: result.modules?.length || 0,
    };
  },
});
