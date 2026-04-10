/**
 * Runtime shims for sandboxed plugin execution
 */

import type { RuntimeAPI, PermissionSpec } from '@kb-labs/plugin-contracts';
import { createFSShim } from './fs-shim.js';
import { createFetchShim } from './fetch-shim.js';
import { createEnvShim } from './env-shim.js';

export { createFSShim, type CreateFSShimOptions } from './fs-shim.js';
export { createFetchShim } from './fetch-shim.js';
export { createEnvShim } from './env-shim.js';

export interface CreateRuntimeAPIOptions {
  permissions: PermissionSpec;
  cwd: string;
  outdir?: string;
}

/**
 * Create the complete RuntimeAPI with all shims
 */
export function createRuntimeAPI(options: CreateRuntimeAPIOptions): RuntimeAPI {
  const { permissions, cwd, outdir } = options;

  return {
    fs: createFSShim({ permissions, cwd, outdir }),
    fetch: createFetchShim({ permissions }),
    env: createEnvShim({ permissions }),
  };
}
