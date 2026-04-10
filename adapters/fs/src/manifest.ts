/**
 * @module @kb-labs/adapters-fs/manifest
 * Adapter manifest for filesystem storage.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for filesystem storage.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "fs-storage",
  name: "Filesystem Storage",
  version: "1.0.0",
  description: "Local filesystem storage adapter with path security",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "IStorage",
  capabilities: {
    streaming: true,
    custom: {
      glob: true,
      metadata: true,
    },
  },
  configSchema: {
    baseDir: {
      type: "string",
      default: "process.cwd()",
      description: "Base directory for all file operations",
    },
  },
};
