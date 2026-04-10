import type { ServiceManifest } from '@kb-labs/plugin-contracts';

export const manifest: ServiceManifest = {
  schema: 'kb.service/1',
  id: 'state-daemon',
  name: 'State Daemon',
  version: '1.4.0',
  description: 'Distributed state management (State Broker HTTP server)',
  runtime: {
    entry: 'dist/bin.cjs',
    port: 7777,
    healthCheck: '/health',
  },
  env: {
    PORT: { description: 'HTTP port', default: '7777' },
    NODE_ENV: { description: 'Environment mode', default: 'development' },
  },
};

export default manifest;
