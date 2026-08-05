import type { ProcessBackendCapabilities } from '@kb-labs/core-platform/adapters';
import { NodeProcessBackend } from './node-backend.js';

export class DarwinProcessBackend extends NodeProcessBackend {
  capabilities(): ProcessBackendCapabilities {
    return { platform: 'darwin', processGroups: true, hardMemoryLimit: false, hardCpuLimit: false, processTreeAccounting: false, maxProcesses: false };
  }
}
