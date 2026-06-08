import type { ServiceManifest } from '@kb-labs/plugin-contracts';

export const manifest: ServiceManifest = {
  schema: 'kb.service/1',
  id: 'rest',
  name: 'REST API',
  version: '1.2.0',
  description: 'Platform REST API daemon — routes, plugin execution, OpenAPI',
  runtime: {
    entry: 'dist/index.js',
    port: 5050,
    healthCheck: '/api/v1/health',
    socket: '/tmp/kb-${KB_SOCKET_HASH}/rest-api.sock',
  },
  dependsOn: ['qdrant'],
  env: {
    PORT: { description: 'HTTP port', default: '5050' },
    REST_API_HOST: { description: 'Bind host', default: '127.0.0.1' },
    NODE_ENV: { description: 'Environment mode', default: 'development' },
  },
};

export default manifest;
