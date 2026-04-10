/**
 * marketplace:commands command - Show all plugin commands with real invocation syntax
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { registry } from '../../../registry/service';
import type { Command } from '../../../registry/legacy-types';
import { safeColors, type SectionContent } from '@kb-labs/shared-cli-ui';

type PluginsCommandsFlags = {
  json: { type: 'boolean'; description?: string };
  plugin: { type: 'string'; description?: string };
  sort: { type: 'string'; description?: string };
};

type PluginsCommandsResult = CommandResult & {
  message: string;
  sections?: SectionContent[];
  json: {
    groups: Record<string, Array<{ name: string; description: string; category?: string }>>;
    totalGroups: number;
    totalCommands: number;
  };
};

type GroupedCommands = Record<string, Command[]>;

export const pluginsCommands = defineSystemCommand<PluginsCommandsFlags, PluginsCommandsResult>({
  name: 'commands',
  description: 'Show all plugin commands with their real invocation syntax',
  category: 'marketplace',
  examples: generateExamples('commands', 'marketplace', [
    { flags: {} },
    { flags: { plugin: '@kb-labs/mind' } },
    { flags: { sort: 'count' } },
    { flags: { json: true } },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
    plugin: { type: 'string', description: 'Filter by plugin ID' },
    sort: { type: 'string', description: 'Sort order: alpha (default), count, type' },
  },
  async handler(ctx, argv, flags) {
    const commands = registry.list();
    const _groups = registry.listGroups();

    // Group commands by plugin/product
    const grouped: GroupedCommands = {};

    for (const cmd of commands) {
      // Get the group name (first part of command name before space or colon)
      const groupName = cmd.name.split(/[\s:]/)[0] ?? cmd.name;

      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName]!.push(cmd);
    }

    // Filter by plugin if specified (match by group name or category)
    const pluginFilter = flags.plugin ?? '';
    const filteredGroups = pluginFilter
      ? Object.fromEntries(
          Object.entries(grouped).filter(([name, cmds]) => {
            // Match group name
            if (name === pluginFilter || name.includes(pluginFilter)) {return true;}
            // Match category
            return cmds.some(cmd => cmd.category === pluginFilter || cmd.category?.includes(pluginFilter));
          })
        )
      : grouped;

    const totalCommands = Object.values(filteredGroups).reduce((sum, cmds) => sum + cmds.length, 0);
    const totalGroups = Object.keys(filteredGroups).length;

    // Sort order
    const sortOrder = flags.sort || 'alpha';
    const validSorts = ['alpha', 'count', 'type'];
    if (!validSorts.includes(sortOrder)) {
      throw new Error(`Invalid sort order: ${sortOrder}. Valid options: ${validSorts.join(', ')}`);
    }

    // JSON output
    if (flags.json) {
      const output: Record<string, Array<{ name: string; description: string; category?: string }>> = {};

      for (const [groupName, cmds] of Object.entries(filteredGroups)) {
        output[groupName] = cmds.map(cmd => ({
          name: cmd.name,
          description: cmd.describe || '',
          category: cmd.category,
        }));
      }

      return {
        ok: true,
        status: 'success',
        message: `Found ${totalCommands} commands in ${totalGroups} groups`,
        json: {
          groups: output,
          totalGroups,
          totalCommands,
        },
      };
    }

    // Human-readable output with modern UI
    const sections: SectionContent[] = [];

    // Summary section
    sections.push({
      header: 'Summary',
      items: [
        `${safeColors.bold('Groups')}: ${totalGroups}`,
        `${safeColors.bold('Commands')}: ${totalCommands}`,
        `${safeColors.bold('Sort')}: ${sortOrder}`,
        ...(flags.plugin ? [`${safeColors.bold('Filter')}: ${flags.plugin}`] : []),
      ],
    });

    // Helper function to sort groups based on sort order
    const sortGroups = (entries: [string, Command[]][]) => {
      switch (sortOrder) {
        case 'count':
          return entries.sort(([, a], [, b]) => b.length - a.length);
        case 'type':
          // type sort is handled by system/product split, so just alpha within each
          return entries.sort(([a], [b]) => a.localeCompare(b));
        case 'alpha':
        default:
          return entries.sort(([a], [b]) => a.localeCompare(b));
      }
    };

    // Group commands by type (system vs product)
    const systemGroups: [string, Command[]][] = [];
    const productGroups: [string, Command[]][] = [];

    const sortedGroups = Object.entries(filteredGroups);

    for (const [groupName, cmds] of sortedGroups) {
      const isSystemGroup = cmds.some(cmd =>
        cmd.category && ['plugins', 'jobs', 'workflow', 'worker', 'debug', 'info', 'logging', 'registry'].includes(cmd.category)
      );

      if (isSystemGroup) {
        systemGroups.push([groupName, cmds]);
      } else {
        productGroups.push([groupName, cmds]);
      }
    }

    // System Commands section
    if (systemGroups.length > 0) {
      const systemItems: string[] = [];
      const sortedSystemGroups = sortGroups(systemGroups);

      for (const [groupName, cmds] of sortedSystemGroups) {
        systemItems.push(''); // Empty line before each group
        systemItems.push(`⚙️  ${safeColors.bold(groupName)} ${safeColors.muted(`(${cmds.length})`)}`);

        const sortedCmds = cmds.sort((a, b) => a.name.localeCompare(b.name));
        for (const cmd of sortedCmds) {
          const invocation = safeColors.bold(`kb ${cmd.name}`);
          const description = cmd.describe ? ` ${safeColors.muted(cmd.describe)}` : '';
          systemItems.push(`  ${invocation}${description}`);
        }
      }

      sections.push({
        header: 'System Commands',
        items: systemItems,
      });
    }

    // Product Commands section
    if (productGroups.length > 0) {
      const productItems: string[] = [];
      const sortedProductGroups = sortGroups(productGroups);

      for (const [groupName, cmds] of sortedProductGroups) {
        productItems.push(''); // Empty line before each group
        productItems.push(`📦 ${safeColors.bold(groupName)} ${safeColors.muted(`(${cmds.length})`)}`);

        const sortedCmds = cmds.sort((a, b) => a.name.localeCompare(b.name));
        for (const cmd of sortedCmds) {
          const invocation = safeColors.bold(`kb ${cmd.name}`);
          const description = cmd.describe ? ` ${safeColors.muted(cmd.describe)}` : '';
          productItems.push(`  ${invocation}${description}`);
        }
      }

      sections.push({
        header: 'Product Commands',
        items: productItems,
      });
    }

    // Next Steps section
    sections.push({
      header: 'Next Steps',
      items: [
        `kb marketplace commands --plugin <name>  ${safeColors.muted('Filter by plugin')}`,
        `kb marketplace commands --sort <order>  ${safeColors.muted('Sort: alpha, count, type')}`,
        `kb marketplace commands --json  ${safeColors.muted('Get machine-readable output')}`,
        `kb marketplace list  ${safeColors.muted('Show installed plugins')}`,
      ],
    });

    const jsonGroups: Record<string, Array<{ name: string; description: string; category?: string }>> = {};
    for (const [groupName, cmds] of Object.entries(filteredGroups)) {
      jsonGroups[groupName] = cmds.map(cmd => ({
        name: cmd.name,
        description: cmd.describe || '',
        category: cmd.category,
      }));
    }

    return {
      ok: true,
      status: 'success',
      message: `Found ${totalCommands} commands in ${totalGroups} groups`,
      sections,
      json: {
        groups: jsonGroups,
        totalGroups,
        totalCommands,
      },
    };
  },
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      console.log(JSON.stringify(result.json, null, 2));
    } else {
      ctx.ui.success('Plugin Commands Registry', { sections: result.sections ?? [] });
    }
  },
});
