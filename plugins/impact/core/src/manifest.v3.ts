import { defineCommandFlags, combinePermissions, generateExamples } from '@kb-labs/sdk';

const pluginPermissions = combinePermissions()
  .withFs({
    mode: 'read',
    allow: ['**/*'],
  })
  .withQuotas({
    timeoutMs: 30000,
    memoryMb: 256,
  })
  .build();

const jsonFlag = {
  json: {
    type: 'boolean' as const,
    description: 'Output as JSON',
    default: false,
  },
};

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/impact',
  version: '0.1.0',

  configSection: 'impact',

  display: {
    name: 'Impact Analysis',
    description: 'Analyze affected packages, stale docs, reindex',
    tags: ['impact', 'analysis', 'dependencies', 'docs'],
  },

  cli: {
    commands: [
      {
        path: 'impact check',
        describe: 'Full impact analysis (packages + docs)',
        longDescription:
          'Analyzes workspace changes to determine affected packages (direct, dependent, transitive) and stale documentation.',

        handler: './cli/commands/check.js#default',

        flags: defineCommandFlags(jsonFlag),

        examples: generateExamples('check', 'impact', [
          { description: 'Full impact analysis', flags: {} },
          { description: 'JSON output for agents', flags: { json: true } },
        ]),

        permissions: pluginPermissions,
      },
      {
        path: 'impact packages',
        describe: 'Package dependency impact analysis',
        longDescription:
          'Shows which packages are directly changed, which depend on them, and which are transitively affected.',

        handler: './cli/commands/packages.js#default',

        flags: defineCommandFlags(jsonFlag),

        examples: generateExamples('packages', 'impact', [
          { description: 'Package impact', flags: {} },
          { description: 'JSON output', flags: { json: true } },
        ]),

        permissions: pluginPermissions,
      },
      {
        path: 'impact docs',
        describe: 'Documentation impact analysis',
        longDescription:
          'Checks which documentation files are stale, need review, or require reindexing based on package changes.',

        handler: './cli/commands/docs.js#default',

        flags: defineCommandFlags(jsonFlag),

        examples: generateExamples('docs', 'impact', [
          { description: 'Doc impact', flags: {} },
          { description: 'JSON output', flags: { json: true } },
        ]),

        permissions: pluginPermissions,
      },
    ],
  },

  permissions: pluginPermissions,
};

export default manifest;
