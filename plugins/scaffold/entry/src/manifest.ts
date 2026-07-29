import { combinePermissions, kbPlatformPreset } from '@kb-labs/sdk';

const permissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({
    mode: 'readWrite',
    allow: [
      '.kb/plugins/**',
      '.kb/marketplace.lock',
      'plugins/**',
      'adapters/**',
    ],
  })
  .withEnv(['KB_MARKETPLACE_URL', 'KB_GATEWAY_URL'])
  .withQuotas({ timeoutMs: 120000, memoryMb: 256 })
  .build();

const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/scaffold',
  version: '0.1.0',
  display: {
    name: 'Scaffold',
    description: 'Entity scaffolder for plugins and adapters',
    tags: ['scaffold', 'generator', 'dx'],
  },
  cli: {
    groupMeta: [
      { path: 'scaffold', describe: 'Scaffold KB Labs entities' },
    ],
    commands: [
      {
        path: 'scaffold run',
        describe: 'Scaffold <entity> <name> from blocks',
        handler: './commands/scaffold.js#default',
        flags: [
          {
            name: 'blocks',
            type: 'string',
            description: 'Comma-separated block ids',
          },
          {
            name: 'yes',
            alias: 'y',
            type: 'boolean',
            description: 'Accept defaults and skip prompts',
          },
          {
            name: 'force',
            type: 'boolean',
            description: 'Overwrite non-empty target directory',
          },
          {
            name: 'dry-run',
            type: 'boolean',
            description: 'Print the tree that would be written and exit',
          },
          {
            name: 'out',
            type: 'string',
            description: 'Override the output directory',
          },
          {
            name: 'scope',
            type: 'string',
            description: 'npm scope for the generated package',
          },
          {
            name: 'mode',
            type: 'string',
            description:
              'Layout mode: "in-workspace" (workspace:* deps) or "standalone" (semver deps + pnpm-workspace.yaml)',
          },
        ],
        examples: [
          'kb scaffold run plugin my-plugin',
          'kb scaffold run adapter my-llm --blocks base',
          'kb scaffold run plugin ui --scope @acme --yes',
          'kb scaffold run plugin demo --dry-run',
        ],
      },
      {
        path: 'scaffold doctor',
        describe: 'Scan user plugins for common issues',
        handler: './commands/doctor.js#default',
        flags: [
          {
            name: 'path',
            type: 'string',
            description: 'Path to scan (default: .kb/plugins)',
          },
          {
            name: 'json',
            type: 'boolean',
            description: 'Emit JSON instead of text',
          },
        ],
        examples: [
          'kb scaffold doctor',
          'kb scaffold doctor --path ./plugins',
          'kb scaffold doctor --json',
        ],
      },
    ],
  },
  permissions,
} as const;

export default manifest;
