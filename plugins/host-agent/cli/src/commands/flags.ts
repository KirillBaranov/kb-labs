export const registerFlags = {
  gateway: {
    type: 'string' as const,
    describe: 'Gateway URL (e.g. http://localhost:4000 or https://gateway.example.com)',
    required: true,
  },
  name: {
    type: 'string' as const,
    describe: 'Display name for this host (default: hostname)',
  },
  workspace: {
    type: 'array' as const,
    describe: 'Workspace paths this agent is allowed to access (can specify multiple)',
    string: true,
  },
  namespace: {
    type: 'string' as const,
    describe: 'Namespace ID (default: "default")',
    default: 'default',
  },
  json: {
    type: 'boolean' as const,
    describe: 'Output as JSON',
    default: false,
  },
};

export const statusFlags = {
  json: {
    type: 'boolean' as const,
    describe: 'Output as JSON',
    default: false,
  },
};

export const listFlags = {
  json: {
    type: 'boolean' as const,
    describe: 'Output as JSON',
    default: false,
  },
  gateway: {
    type: 'string' as const,
    describe: 'Gateway URL (default: from ~/.kb/agent.json or http://localhost:4000)',
  },
};
