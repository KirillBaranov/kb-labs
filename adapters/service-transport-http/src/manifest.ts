import type { AdapterManifest } from '@kb-labs/sdk/adapters';

export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'service-transport-http',
  name: 'HTTP Service Transport',
  version: '1.0.0',
  description: 'HTTP/unix-socket transport for gateway → service communication',
  type: 'core',
  implements: 'IServiceTransport',
};
