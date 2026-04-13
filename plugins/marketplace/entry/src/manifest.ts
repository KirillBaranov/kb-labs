/**
 * @module @kb-labs/marketplace-cli/manifest
 * ManifestV3 for marketplace CLI plugin.
 * Declares commands with subgroups for nested routing.
 */

import { combinePermissions, kbPlatformPreset } from '@kb-labs/sdk';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withEnv(['KB_MARKETPLACE_URL', 'KB_GATEWAY_URL', 'NODE_ENV'])
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/marketplace',
  version: '0.1.0',
  display: {
    name: 'Marketplace',
    description: 'Unified marketplace for plugins, adapters, workflows, and more',
    tags: ['marketplace', 'plugins', 'adapters'],
  },
  cli: {
    groupMeta: [
      { name: 'marketplace', describe: 'Marketplace management commands' },
      { name: 'marketplace/plugins', describe: 'Plugin management' },
    ],
    commands: [
      // Top-level: kb marketplace install
      { id: 'install', group: 'marketplace', describe: 'Install package(s)', handler: './commands/install.js#default' },
      { id: 'uninstall', group: 'marketplace', describe: 'Uninstall package(s)', handler: './commands/uninstall.js#default' },
      { id: 'update', group: 'marketplace', describe: 'Update package(s)', handler: './commands/update.js#default' },
      { id: 'sync', group: 'marketplace', describe: 'Sync workspace to lock', handler: './commands/sync.js#default' },
      // Subgroup: kb marketplace plugins list
      { id: 'list', group: 'marketplace', subgroup: 'plugins', describe: 'List installed plugins', handler: './commands/plugins/list.js#default' },
      { id: 'enable', group: 'marketplace', subgroup: 'plugins', describe: 'Enable a plugin', handler: './commands/plugins/enable.js#default' },
      { id: 'disable', group: 'marketplace', subgroup: 'plugins', describe: 'Disable a plugin', handler: './commands/plugins/disable.js#default' },
      { id: 'link', group: 'marketplace', subgroup: 'plugins', describe: 'Link a local plugin', handler: './commands/plugins/link.js#default' },
      { id: 'unlink', group: 'marketplace', subgroup: 'plugins', describe: 'Unlink a plugin', handler: './commands/plugins/unlink.js#default' },
      { id: 'doctor', group: 'marketplace', subgroup: 'plugins', describe: 'Diagnose issues', handler: './commands/plugins/doctor.js#default' },
    ],
  },
  permissions: pluginPermissions,
};

export default manifest;
