/**
 * @module @kb-labs/adapters-s3/manifest
 * Adapter manifest for S3-compatible storage (MinIO, AWS S3, etc).
 */

import type { AdapterManifest } from "@kb-labs/sdk/adapters";

export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "s3-storage",
  name: "S3 Storage",
  version: "1.0.0",
  description: "S3-compatible storage adapter (AWS S3, MinIO). Implements IStorage.",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "IStorage",
  capabilities: {
    streaming: true,
    custom: {
      s3Compatible: true,
      autoBucket: true,
    },
  },
  configSchema: {
    endpoint: {
      type: "string",
      description: "S3 endpoint URL (e.g. http://kb-minio:9000 for MinIO)",
    },
    bucket: {
      type: "string",
      description: "Bucket name. Created automatically if it does not exist.",
    },
    region: {
      type: "string",
      default: "us-east-1",
      description: "AWS region (use any value for MinIO)",
    },
    accessKeyId: {
      type: "string",
      description: "Access key ID (MINIO_ROOT_USER for MinIO)",
    },
    secretAccessKey: {
      type: "string",
      description: "Secret access key (MINIO_ROOT_PASSWORD for MinIO)",
    },
    forcePathStyle: {
      type: "boolean",
      default: true,
      description: "Force path-style URLs — required for MinIO",
    },
  },
};
