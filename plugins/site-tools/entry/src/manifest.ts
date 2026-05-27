import { combinePermissions, kbPlatformPreset } from '@kb-labs/sdk';

const permissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({
    mode: 'readWrite',
    allow: [
      'sites/web/apps/web/app/[locale]/**',
      'sites/web/apps/web/messages/*.json',
    ],
  })
  .withQuotas({ timeoutMs: 30000, memoryMb: 128 })
  .build();

const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/site-tools',
  version: '0.1.0',
  display: {
    name: 'Site Tools',
    description: 'Developer tools for the KB Labs marketing site',
    tags: ['site', 'scaffold', 'seo', 'dx'],
  },
  cli: {
    groupMeta: [
      { path: 'site', describe: 'Marketing site developer tools' },
    ],
    commands: [
      {
        path: 'site page',
        describe: 'Scaffold a new site page with SEO defaults (page.tsx + opengraph-image.tsx + i18n stubs)',
        handler: './commands/page.js#default',
        flags: [
          {
            name: 'badge',
            type: 'string',
            description: 'Badge text shown on the OG image (e.g. "Product", "Solutions")',
          },
          {
            name: 'dry-run',
            type: 'boolean',
            description: 'Preview what would be created without writing files',
          },
        ],
        examples: [
          { command: 'kb site page pricing', description: 'Create /pricing page' },
          { command: 'kb site page solutions/my-solution --badge Solutions', description: 'Create a solutions sub-page' },
          { command: 'kb site page new-feature --dry-run', description: 'Preview without writing' },
        ],
      },
    ],
  },
  permissions,
};

export default manifest;
