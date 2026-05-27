import type { ServiceManifest } from '@kb-labs/plugin-contracts';

export const manifest: ServiceManifest = {
  schema: 'kb.service/1',
  id: 'studio',
  name: 'Studio',
  version: '0.7.0',
  description: 'KB Labs Web UI — SPA served as static files',
  runtime: {
    entry: 'server.js',
    port: 3000,
    healthCheck: '/',
  },
  dependsOn: ['rest', 'gateway'],
  env: {
    PORT: { description: 'HTTP port', default: '3000' },
  },
};

export default manifest;
