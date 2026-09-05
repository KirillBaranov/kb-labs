import type { ServiceManifest } from '@kb-labs/plugin-contracts';

export const manifest: ServiceManifest = {
  schema: 'kb.service/1',
  id: 'mcp-daemon',
  name: 'MCP Daemon',
  version: '1.0.0',
  description: 'MCP server — exposes plugin commands as tools for external agents',
  runtime: {
    entry: 'dist/index.js',
    port: 7779,
    healthCheck: '/health',
    socket: '/tmp/kb-${KB_SOCKET_HASH}/mcp-daemon.sock',
  },
  env: {
    KB_MCP_DAEMON_PORT: { description: 'TCP port', default: '7779' },
    KB_MCP_DAEMON_HOST: { description: 'Bind host', default: '0.0.0.0' },
    GATEWAY_JWT_SECRET: { description: 'Shared JWT secret (same value as gateway)' },
  },
};

export default manifest;
