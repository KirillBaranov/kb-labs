import { cmd, group, mergeCliGroups, combinePermissions, kbPlatformPreset } from '@kb-labs/sdk';
import { registerFlags, statusFlags, listFlags } from './commands/flags.js';

const pluginPermissions = combinePermissions()
  .with(kbPlatformPreset)
  .withFs({ mode: 'readWrite', allow: ['.kb/**', '~/.kb/**'] })
  .withEnv(['HOME', 'USER', 'KB_GATEWAY_URL'])
  .withQuotas({ timeoutMs: 30000, memoryMb: 128 })
  .build();

export const manifest = {
  schema: 'kb.plugin/3' as const,
  id: '@kb-labs/host-agent',
  version: '0.2.0',

  display: {
    name: 'Workspace Agent',
    description: 'Connect machine to platform for remote execution',
    tags: ['workspace-agent', 'gateway', 'cloud', 'execution'],
  },

  platform: {
    requires: [],
    optional: ['logger'],
  },

  cli: mergeCliGroups(
    group({ path: 'workspace', describe: 'Workspace management' }, [
      cmd('workspace register', './commands/register.js#default', 'Register this machine with a Platform Gateway.')
        .mutate()
        .long(
          'Calls POST /auth/register on the given Gateway URL, receives credentials, ' +
          'and writes ~/.kb/agent.json. Must be run once before starting the Workspace Agent daemon.',
        )
        .flags(registerFlags)
        .examples([
          'kb workspace:register --gateway http://localhost:4000',
          'kb workspace:register --gateway https://gateway.kblabs.dev --name my-laptop --workspace ~/projects/my-app',
        ]),

      cmd('workspace status', './commands/status.js#default', 'Show Workspace Agent connection status.')
        .read()
        .long(
          'Connects to the daemon via IPC socket and queries its status (connected, hostId, gatewayUrl, capabilities). ' +
          'Start the daemon with `kb workspace:start` or `pnpm dev:start:host-agent`.',
        )
        .flags(statusFlags)
        .examples(['kb workspace:status', 'kb workspace:status --json']),

      cmd('workspace list', './commands/list.js#default', 'List all connected Workspace Agents.')
        .read()
        .long('Queries the Gateway REST API for all registered hosts and shows their status, capabilities, and last seen time.')
        .flags(listFlags)
        .examples(['kb workspace:list', 'kb workspace:list --json', 'kb workspace:list --gateway https://gateway.kblabs.dev']),
    ]),

    group({ path: 'agent', describe: 'Agent management' }, [
      cmd('agent register', './commands/register.js#default', '[Alias for workspace:register] Register this machine with a Platform Gateway.')
        .flags(registerFlags)
        .examples(['kb agent:register --gateway http://localhost:4000']),

      cmd('agent status', './commands/status.js#default', '[Alias for workspace:status] Show Workspace Agent connection status.')
        .flags(statusFlags)
        .examples(['kb agent:status', 'kb agent:status --json']),
    ]),
  ),

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
