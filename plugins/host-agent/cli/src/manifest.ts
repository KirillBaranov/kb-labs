import { defineCommandFlags, combinePermissions, kbPlatformPreset } from '@kb-labs/sdk';
import { registerFlags, statusFlags, listFlags } from './commands/flags.js';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({
    mode: 'readWrite',
    allow: ['.kb/**', '~/.kb/**'],
  })
  .withEnv(['HOME', 'USER', 'KB_GATEWAY_URL'])
  .withQuotas({
    timeoutMs: 30000,
    memoryMb: 128,
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/host-agent',
  version: '0.2.0',

  display: {
    name: 'Workspace Agent',
    description: 'Connect this machine to KB Labs Platform for remote plugin execution.',
    tags: ['workspace-agent', 'gateway', 'cloud', 'execution'],
  },

  platform: {
    requires: [],
    optional: ['logger'],
  },

  cli: {
    commands: [
      // Primary commands: workspace:*
      {
        id: 'workspace:register',
        group: 'workspace',
        describe: 'Register this machine with a Platform Gateway.',
        longDescription:
          'Calls POST /auth/register on the given Gateway URL, receives credentials, ' +
          'and writes ~/.kb/agent.json. Must be run once before starting the Workspace Agent daemon.',

        handler: './commands/register.js#default',
        handlerPath: './commands/register.js',

        flags: defineCommandFlags(registerFlags),

        examples: [
          'kb workspace:register --gateway http://localhost:4000',
          'kb workspace:register --gateway https://gateway.kblabs.dev --name my-laptop --workspace ~/projects/my-app',
        ],
      },

      {
        id: 'workspace:status',
        group: 'workspace',
        describe: 'Show Workspace Agent connection status.',
        longDescription:
          'Connects to the daemon via IPC socket and queries its status (connected, hostId, gatewayUrl, capabilities). ' +
          'Start the daemon with `kb workspace:start` or `pnpm dev:start:host-agent`.',

        handler: './commands/status.js#default',
        handlerPath: './commands/status.js',

        flags: defineCommandFlags(statusFlags),

        examples: [
          'kb workspace:status',
          'kb workspace:status --json',
        ],
      },

      {
        id: 'workspace:list',
        group: 'workspace',
        describe: 'List all connected Workspace Agents.',
        longDescription:
          'Queries the Gateway REST API for all registered hosts and shows their status, capabilities, and last seen time.',

        handler: './commands/list.js#default',
        handlerPath: './commands/list.js',

        flags: defineCommandFlags(listFlags),

        examples: [
          'kb workspace:list',
          'kb workspace:list --json',
          'kb workspace:list --gateway https://gateway.kblabs.dev',
        ],
      },

      // Legacy aliases: agent:* (backwards compatible)
      {
        id: 'agent:register',
        group: 'agent',
        describe: '[Alias for workspace:register] Register this machine with a Platform Gateway.',

        handler: './commands/register.js#default',
        handlerPath: './commands/register.js',

        flags: defineCommandFlags(registerFlags),

        examples: [
          'kb agent:register --gateway http://localhost:4000',
        ],
      },

      {
        id: 'agent:status',
        group: 'agent',
        describe: '[Alias for workspace:status] Show Workspace Agent connection status.',

        handler: './commands/status.js#default',
        handlerPath: './commands/status.js',

        flags: defineCommandFlags(statusFlags),

        examples: [
          'kb agent:status',
          'kb agent:status --json',
        ],
      },
    ],
  },

  capabilities: [],
  permissions: pluginPermissions,
  artifacts: [
    {
      id: 'workspace-agent.config',
      pathTemplate: '~/.kb/agent.json',
      description: 'Workspace Agent credentials and configuration.',
    },
  ],
};

export default manifest;
