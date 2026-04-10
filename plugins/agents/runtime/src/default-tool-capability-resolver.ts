import type { ToolCapabilityResolver } from '@kb-labs/agent-sdk';
import type { ToolCapability } from '@kb-labs/agent-contracts';

const DEFAULT_CAPABILITIES: ToolCapability[] = [
  'filesystem',
  'search',
  'code-navigation',
  'shell',
  'memory',
  'planning',
  'todo',
  'interaction',
  'reporting',
  'delegation',
];

export function createDefaultToolCapabilityResolver(): ToolCapabilityResolver {
  return {
    id: 'default-tool-capability-resolver',
    resolve() {
      return DEFAULT_CAPABILITIES;
    },
  };
}
