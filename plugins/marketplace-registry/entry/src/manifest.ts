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
    commands: [
      { path: 'marketplace publish',   describe: 'Publish plugin to KB Labs Registry',        handler: './commands/publish.js#default' },
      { path: 'marketplace share',     describe: 'Share a private plugin (--with or --link)', handler: './commands/share.js#default' },
      { path: 'marketplace yank',      describe: 'Yank a specific version',                   handler: './commands/yank.js#default' },
      { path: 'marketplace deprecate', describe: 'Deprecate a package',                       handler: './commands/deprecate.js#default' },
    ],
  },
  permissions: pluginPermissions,
};

export default manifest;
