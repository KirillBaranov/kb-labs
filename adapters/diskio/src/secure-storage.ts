import type { IStorage, StorageMetadata } from "@kb-labs/sdk/adapters";

export interface StoragePermissions {
  allowlist?: string[];
  denylist?: string[];
  read?: boolean;
  write?: boolean;
  delete?: boolean;
}

export class StoragePermissionError extends Error {
  public readonly operation: string;
  public readonly path: string;
  public readonly reason: string;

  constructor(
    operation: string,
    path: string,
    reason: string,
  ) {
    super(["Storage access denied:", operation, path, "-", reason].join(" "));
    this.operation = operation;
    this.path = path;
    this.reason = reason;
    this.name = "StoragePermissionError";
  }
}

/** Adds operation and prefix policy checks around any IStorage implementation. */
export class SecureStorageAdapter implements IStorage {
  constructor(
    private readonly delegate: IStorage,
    private readonly policy: StoragePermissions,
  ) {}

  private authorize(path: string, operation: "read" | "write" | "delete"): void {
    if (this.policy[operation] === false) {
      throw new StoragePermissionError(operation, path, `${operation} operations are disabled`);
    }

    const blocked = this.policy.denylist?.find((prefix) => path.startsWith(prefix));
    if (blocked !== undefined) {
      throw new StoragePermissionError(operation, path, `path matches denylist: ${blocked}`);
    }

    const rules = this.policy.allowlist;
    if (rules !== undefined && rules.length > 0 && !rules.some((prefix) => path.startsWith(prefix))) {
      throw new StoragePermissionError(
        operation,
        path,
        `path not in allowlist: [${rules.join(", ")}]`,
      );
    }
  }

  async read(path: string): Promise<Buffer | null> {
    this.authorize(path, "read");
    return this.delegate.read(path);
  }

  async write(path: string, data: Buffer): Promise<void> {
    this.authorize(path, "write");
    await this.delegate.write(path, data);
  }

  async delete(path: string): Promise<void> {
    this.authorize(path, "delete");
    await this.delegate.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    this.authorize(prefix, "read");
    const entries = await this.delegate.list(prefix);
    return entries.filter((entry) => {
      try {
        this.authorize(entry, "read");
        return true;
      } catch (error) {
        if (error instanceof StoragePermissionError) return false;
        throw error;
      }
    });
  }

  async exists(path: string): Promise<boolean> {
    try {
      this.authorize(path, "read");
      return await this.delegate.exists(path);
    } catch (error) {
      if (error instanceof StoragePermissionError) return false;
      throw error;
    }
  }

  async readStream(path: string): Promise<NodeJS.ReadableStream | null> {
    this.authorize(path, "read");
    return this.delegate.readStream?.(path) ?? null;
  }

  async writeStream(path: string, stream: NodeJS.ReadableStream): Promise<void> {
    this.authorize(path, "write");
    if (this.delegate.writeStream === undefined) throw new Error("writeStream() not supported by base storage adapter");
    await this.delegate.writeStream(path, stream);
  }

  async stat(path: string): Promise<StorageMetadata | null> {
    this.authorize(path, "read");
    return this.delegate.stat?.(path) ?? null;
  }

  async copy(source: string, destination: string): Promise<void> {
    this.authorize(source, "read");
    this.authorize(destination, "write");
    if (this.delegate.copy === undefined) throw new Error("copy() not supported by base storage adapter");
    await this.delegate.copy(source, destination);
  }

  async move(source: string, destination: string): Promise<void> {
    this.authorize(source, "read");
    this.authorize(source, "delete");
    this.authorize(destination, "write");
    if (this.delegate.move === undefined) throw new Error("move() not supported by base storage adapter");
    await this.delegate.move(source, destination);
  }

  async listWithMetadata(prefix: string): Promise<StorageMetadata[]> {
    this.authorize(prefix, "read");
    const entries = await this.delegate.listWithMetadata?.(prefix);
    if (entries === undefined) return [];
    return entries.filter((entry) => {
      try {
        this.authorize(entry.path, "read");
        return true;
      } catch (error) {
        if (error instanceof StoragePermissionError) return false;
        throw error;
      }
    });
  }
}

export function createSecureStorage(base: IStorage, permissions: StoragePermissions): SecureStorageAdapter {
  return new SecureStorageAdapter(base, permissions);
}

export default createSecureStorage;
