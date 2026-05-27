import type { ServiceManifest } from '@kb-labs/plugin-contracts';

export const manifest: ServiceManifest = {
  schema: 'kb.service/1',
  id: 'marketplace',
  name: 'Marketplace',
  version: '1.0.0',
  description: 'Unified entity marketplace — install, manage, discover',
  runtime: {
    entry: 'dist/index.js',
    port: 5070,
    healthCheck: '/health',
  },
  env: {
    PORT: { description: 'HTTP port', default: '5070' },
    NODE_ENV: { description: 'Environment mode', default: 'development' },
  },
};

export default manifest;
