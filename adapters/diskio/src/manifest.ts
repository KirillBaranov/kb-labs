import type { AdapterManifest } from "@kb-labs/sdk/adapters";

export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "disk-io-storage",
  name: "Disk I/O Storage",
  version: "1.0.0",
  description: "A local directory storage adapter with boundary checks and metadata support",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "IStorage",
  capabilities: {
    streaming: true,
    custom: {
      metadata: true,
    },
  },
  launcher: { requirements: [
    { id: "storage-base-dir", path: "/platform/adapterOptions/storage/baseDir", default: "process.cwd()" },
  ] },
  configSchema: {
    baseDir: {
      type: "string",
      default: "process.cwd()",
      description: "Directory used as the storage root",
    },
  },
};
