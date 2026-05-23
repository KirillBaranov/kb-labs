/**
 * @module @kb-labs/adapters-s3
 * S3-compatible storage adapter implementing IStorage interface.
 * Supports AWS S3 and self-hosted MinIO (via endpoint + forcePathStyle).
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-s3';
 *
 * const storage = createAdapter({
 *   endpoint: 'http://localhost:9000',
 *   bucket: 'my-bucket',
 *   accessKeyId: 'minioadmin',
 *   secretAccessKey: 'minioadmin',
 *   forcePathStyle: true,
 * });
 *
 * await storage.write('docs/readme.md', Buffer.from('# Hello'));
 * const content = await storage.read('docs/readme.md');
 * const files = await storage.list('docs/');
 * await storage.delete('docs/readme.md');
 * ```
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadBucketCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { IStorage, StorageMetadata } from "@kb-labs/sdk/adapters";

export { manifest } from "./manifest.js";

export interface S3StorageConfig {
  /** S3 endpoint URL. Required for MinIO (e.g. http://kb-minio:9000). Optional for AWS. */
  endpoint?: string;
  /** Bucket name. Auto-created on first use if it does not exist. */
  bucket: string;
  /** AWS region. Defaults to "us-east-1" (use any value for MinIO). */
  region?: string;
  /** Access key ID (MINIO_ROOT_USER for MinIO, AWS access key for S3). */
  accessKeyId: string;
  /** Secret access key (MINIO_ROOT_PASSWORD for MinIO, AWS secret for S3). */
  secretAccessKey: string;
  /**
   * Force path-style URLs (bucket in path, not subdomain).
   * Required for MinIO. Defaults to true when endpoint is set.
   */
  forcePathStyle?: boolean;
}

/**
 * Convert a ReadableStream (AWS SDK Body) to a Node.js Buffer.
 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export class S3StorageAdapter implements IStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketEnsured = false;

  constructor(config: S3StorageConfig) {
    const {
      endpoint,
      bucket,
      region = "us-east-1",
      accessKeyId,
      secretAccessKey,
      forcePathStyle,
    } = config;

    this.bucket = bucket;

    const clientConfig: S3ClientConfig = {
      region,
      credentials: { accessKeyId, secretAccessKey },
    };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      // Default to true for custom endpoints (MinIO requirement)
      clientConfig.forcePathStyle = forcePathStyle ?? true;
    } else if (forcePathStyle !== undefined) {
      clientConfig.forcePathStyle = forcePathStyle;
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Ensure bucket exists. Called lazily before first real operation.
   * Non-fatal — if bucket creation fails (e.g. already exists), proceeds anyway.
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    this.bucketEnsured = true;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      // Bucket does not exist — create it
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch {
        // May already exist (race condition) or user lacks permission — ignore
      }
    }
  }

  async read(path: string): Promise<Buffer | null> {
    await this.ensureBucket();
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      );
      if (!result.Body) return null;
      return streamToBuffer(result.Body as NodeJS.ReadableStream);
    } catch (err: unknown) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async write(path: string, data: Buffer): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: data,
        ContentLength: data.length,
      }),
    );
  }

  async delete(path: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: path }),
    );
  }

  async list(prefix: string): Promise<string[]> {
    await this.ensureBucket();
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of result.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureBucket();
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: path }),
      );
      return true;
    } catch (err: unknown) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  async readStream(path: string): Promise<NodeJS.ReadableStream | null> {
    await this.ensureBucket();
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      );
      if (!result.Body) return null;
      // AWS SDK v3 Body may be a web ReadableStream — convert to Node.js Readable
      const body = result.Body;
      if (body instanceof Readable) return body;
      // Web Streams API → Node.js Readable (Node 18+)
      return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
    } catch (err: unknown) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async writeStream(path: string, stream: NodeJS.ReadableStream): Promise<void> {
    await this.ensureBucket();
    const data = await streamToBuffer(stream);
    await this.write(path, data);
  }

  async stat(path: string): Promise<StorageMetadata | null> {
    await this.ensureBucket();
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: path }),
      );
      return {
        path,
        size: result.ContentLength ?? 0,
        lastModified: result.LastModified?.toISOString() ?? new Date().toISOString(),
        contentType: result.ContentType,
        etag: result.ETag,
      };
    } catch (err: unknown) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async listWithMetadata(prefix: string): Promise<StorageMetadata[]> {
    await this.ensureBucket();
    const items: StorageMetadata[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of result.Contents ?? []) {
        if (obj.Key) {
          items.push({
            path: obj.Key,
            size: obj.Size ?? 0,
            lastModified: obj.LastModified?.toISOString() ?? new Date().toISOString(),
            etag: obj.ETag,
          });
        }
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return items;
  }
}

/**
 * Check if an S3 error indicates the object/bucket was not found.
 */
function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return (
    code === "NoSuchKey" ||
    code === "NotFound" ||
    code === "NoSuchBucket" ||
    status === 404
  );
}

export function createAdapter(config: S3StorageConfig): S3StorageAdapter {
  return new S3StorageAdapter(config);
}

export default createAdapter;
