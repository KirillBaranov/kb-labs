/**
 * @module @kb-labs/mind-engine/index/remote-storage
 * Remote storage interface for index upload/download
 *
 * Currently only local storage is implemented.
 * S3/GCS adapters will be added when cloud access is available.
 */

import type { IndexManifest } from './manifest';

/**
 * Information about available update
 */
export interface UpdateInfo {
  /** Whether update is available */
  available: boolean;

  /** Remote manifest if available */
  remoteManifest?: IndexManifest;

  /** Local manifest for comparison */
  localManifest?: IndexManifest;

  /** Reason for update (if available) */
  reason?: string;
}

/**
 * Remote index storage interface
 */
export interface RemoteIndexStorage {
  /** Storage type identifier */
  readonly type: 'local' | 's3' | 'gcs' | 'azure';

  /**
   * Upload index to remote storage
   * @returns Remote URL/path
   */
  upload(
    scopeId: string,
    indexPath: string,
    manifest: IndexManifest,
  ): Promise<string>;

  /**
   * Download index from remote storage
   * @returns Downloaded manifest
   */
  download(
    scopeId: string,
    targetPath: string,
    options?: DownloadOptions,
  ): Promise<IndexManifest>;

  /**
   * Check if remote has newer version
   */
  checkForUpdates(
    scopeId: string,
    localManifest?: IndexManifest,
  ): Promise<UpdateInfo>;

  /**
   * List available indexes for a branch
   */
  listIndexes(branch: string): Promise<IndexManifest[]>;

  /**
   * Get manifest for specific revision
   */
  getManifest(branch: string, revision: string): Promise<IndexManifest | null>;

  /**
   * Find closest ancestor index for a given revision
   */
  findClosestAncestor?(
    branch: string,
    revision: string,
    isAncestor: (rev1: string, rev2: string) => Promise<boolean>,
  ): Promise<IndexManifest | null>;
}

/**
 * Download options
 */
export interface DownloadOptions {
  /** Specific branch to download from */
  branch?: string;

  /** Specific revision to download */
  revision?: string;

  /** Force re-download even if local exists */
  force?: boolean;

  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Download progress
 */
export interface DownloadProgress {
  stage: 'checking' | 'downloading' | 'extracting' | 'verifying';
  bytesDownloaded?: number;
  totalBytes?: number;
  percent?: number;
}

/**
 * Storage factory options
 */
export interface StorageFactoryOptions {
  type: 'local' | 's3' | 'gcs' | 'azure';

  /** Local storage options */
  local?: {
    basePath: string;
  };

  /** S3 options (future) */
  s3?: {
    bucket: string;
    region?: string;
    prefix?: string;
  };

  /** GCS options (future) */
  gcs?: {
    bucket: string;
    prefix?: string;
  };
}

/**
 * Create remote storage based on config
 */
export function createRemoteStorage(options: StorageFactoryOptions): RemoteIndexStorage {
  switch (options.type) {
    case 'local':
      // Lazy import to avoid circular dependencies
      return new LocalIndexStorageImpl(options.local?.basePath ?? '.kb/mind/remote');

    case 's3':
      throw new Error('S3 storage not yet implemented. Use local storage for now.');

    case 'gcs':
      throw new Error('GCS storage not yet implemented. Use local storage for now.');

    case 'azure':
      throw new Error('Azure storage not yet implemented. Use local storage for now.');

    default:
      throw new Error(`Unknown storage type: ${options.type}`);
  }
}

/**
 * Local file-based index storage (for development/testing)
 */
class LocalIndexStorageImpl implements RemoteIndexStorage {
  readonly type = 'local' as const;
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async upload(
    scopeId: string,
    indexPath: string,
    manifest: IndexManifest,
  ): Promise<string> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const targetDir = path.join(
      this.basePath,
      manifest.branch,
      manifest.gitRevision.substring(0, 7),
    );

    await fs.mkdir(targetDir, { recursive: true });

    // Copy index file
    const indexFileName = path.basename(indexPath);
    await fs.copyFile(indexPath, path.join(targetDir, indexFileName));

    // Write manifest
    await fs.writeFile(
      path.join(targetDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );

    // Update latest pointer
    const latestPath = path.join(this.basePath, manifest.branch, 'latest.json');
    await fs.mkdir(path.dirname(latestPath), { recursive: true });
    await fs.writeFile(
      latestPath,
      JSON.stringify({ revision: manifest.gitRevision.substring(0, 7) }),
    );

    return targetDir;
  }

  async download(
    scopeId: string,
    targetPath: string,
    options?: DownloadOptions,
  ): Promise<IndexManifest> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const branch = options?.branch ?? 'main';
    let revision = options?.revision;

    // If no revision specified, get latest
    if (!revision) {
      const latestPath = path.join(this.basePath, branch, 'latest.json');
      try {
        const latestContent = await fs.readFile(latestPath, 'utf8');
        const latest = JSON.parse(latestContent);
        revision = latest.revision;
      } catch {
        throw new Error(`No index found for branch ${branch}`);
      }
    }

    const sourceDir = path.join(this.basePath, branch, revision ?? 'latest');

    // Read manifest
    const manifestPath = path.join(sourceDir, 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent) as IndexManifest;

    // Copy files to target
    await fs.mkdir(targetPath, { recursive: true });

    const files = await fs.readdir(sourceDir);
    for (const file of files) {
      await fs.copyFile(
        path.join(sourceDir, file),
        path.join(targetPath, file),
      );
    }

    return manifest;
  }

  async checkForUpdates(
    scopeId: string,
    localManifest?: IndexManifest,
  ): Promise<UpdateInfo> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const branch = localManifest?.branch ?? 'main';
    const latestPath = path.join(this.basePath, branch, 'latest.json');

    try {
      const latestContent = await fs.readFile(latestPath, 'utf8');
      const latest = JSON.parse(latestContent);

      if (!localManifest) {
        return {
          available: true,
          reason: 'No local index',
        };
      }

      const localRev = localManifest.gitRevision.substring(0, 7);
      if (latest.revision !== localRev) {
        // Load remote manifest
        const remoteManifestPath = path.join(
          this.basePath,
          branch,
          latest.revision,
          'manifest.json',
        );
        const remoteContent = await fs.readFile(remoteManifestPath, 'utf8');
        const remoteManifest = JSON.parse(remoteContent) as IndexManifest;

        return {
          available: true,
          remoteManifest,
          localManifest,
          reason: `New version available: ${latest.revision}`,
        };
      }

      return { available: false };
    } catch {
      return { available: false };
    }
  }

  async listIndexes(branch: string): Promise<IndexManifest[]> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const branchPath = path.join(this.basePath, branch);
    const manifests: IndexManifest[] = [];

    try {
      const entries = await fs.readdir(branchPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'latest') {
          try {
            const manifestPath = path.join(branchPath, entry.name, 'manifest.json');
            const content = await fs.readFile(manifestPath, 'utf8');
            manifests.push(JSON.parse(content));
          } catch {
            // Skip invalid entries
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return manifests.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getManifest(branch: string, revision: string): Promise<IndexManifest | null> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const manifestPath = path.join(this.basePath, branch, revision, 'manifest.json');

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      return JSON.parse(content) as IndexManifest;
    } catch {
      return null;
    }
  }

  async findClosestAncestor(
    branch: string,
    revision: string,
    isAncestor: (rev1: string, rev2: string) => Promise<boolean>,
  ): Promise<IndexManifest | null> {
    const indexes = await this.listIndexes(branch);

    for (const index of indexes) {
      const indexRev = index.gitRevision;
      if (await isAncestor(indexRev, revision)) {
        return index;
      }
    }

    return indexes[0] ?? null; // Fallback to latest if no ancestor found
  }
}

// Re-export implementation for testing
export { LocalIndexStorageImpl as LocalIndexStorage };
