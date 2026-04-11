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
  },
  dependsOn: ['qdrant'],
  env: {
    PORT: { description: 'HTTP port', default: '5050' },
    NODE_ENV: { description: 'Environment mode', default: 'development' },
  },
};

export default manifest;
