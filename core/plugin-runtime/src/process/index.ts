import type { IProcessExecutor, ILogger } from '@kb-labs/core-platform/adapters';
import { DarwinProcessBackend } from './darwin-backend.js';
import { LinuxProcessBackend } from './linux-backend.js';

export { DarwinProcessBackend } from './darwin-backend.js';
export { LinuxProcessBackend } from './linux-backend.js';
export { GovernedProcessError } from './errors.js';
export { BrokeredProcessExecutor } from './brokered-executor.js';
export type { ProcessErrorCode } from './errors.js';

export function createDefaultProcessExecutor(logger?: ILogger): IProcessExecutor {
  if (process.platform === 'darwin') { return new DarwinProcessBackend(logger); }
  return new LinuxProcessBackend(logger);
}
