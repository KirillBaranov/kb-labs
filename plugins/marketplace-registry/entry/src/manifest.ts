import { combinePermissions, kbPlatformPreset } from '@kb-labs/sdk';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withEnv(['KB_GATEWAY_URL', 'KB_REGISTRY_URL', 'KB_REGISTRY_TOKEN', 'KB_REGISTRY_AUTHOR_HANDLE'])
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/marketplace-registry',
  version: '0.1.0',

  display: {
    name: 'Marketplace Registry',
    description: 'Publish and manage plugins in KB Labs Registry',
    tags: ['marketplace', 'registry', 'publish'],
  },

  cli: {
    groupMeta: [
      { path: 'hub', describe: 'KB Labs Hub publishing (plugin author tools)' },
    ],
    commands: [
      {
        path: 'hub publish',
        category: 'Registry',
        operationType: 'mutate' as const,
        describe: 'Publish plugin to KB Labs Registry',
        handler: './commands/publish.js#default',
        permissions: pluginPermissions,
      },
      {
        path: 'hub share',
        category: 'Registry',
        operationType: 'mutate' as const,
        describe: 'Share a private plugin (--with or --link)',
        handler: './commands/share.js#default',
        permissions: pluginPermissions,
      },
      {
        path: 'hub yank',
        category: 'Registry',
        operationType: 'mutate' as const,
        describe: 'Yank a specific version',
        handler: './commands/yank.js#default',
        permissions: pluginPermissions,
      },
      {
        path: 'hub deprecate',
        category: 'Registry',
        operationType: 'mutate' as const,
        describe: 'Deprecate a package',
        handler: './commands/deprecate.js#default',
        permissions: pluginPermissions,
      },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
