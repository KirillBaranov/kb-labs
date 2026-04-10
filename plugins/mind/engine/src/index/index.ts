/**
 * @module @kb-labs/mind-engine/index
 * Incremental indexing module for central index + local overlay architecture
 */

// Manifest types and utilities
export {
  type IndexManifest,
  type IndexStats,
  type IndexStorage,
  type IndexedFile,
  MANIFEST_VERSION,
  MANIFEST_FILENAME,
  createManifest,
  isCompatibleManifest,
  loadManifest,
  saveManifest,
  calculateChecksum,
  getDefaultIndexDir,
  getManifestPath,
} from './manifest';

// Git diff detection
export {
  type ChangedFile,
  type GitDiffOptions,
  GitDiffDetector,
  createGitDiffDetector,
} from './git-diff';

// Merged vector store
export {
  type MergedVectorStoreOptions,
  type MergedIndexStats,
  MergedVectorStore,
  createMergedVectorStore,
} from './merged-store';

// Incremental builder
export {
  type OverlayBuildOptions,
  type OverlayBuildProgress,
  type OverlayBuildResult,
  IncrementalIndexBuilder,
  buildAndStoreOverlay,
  createIncrementalBuilder,
} from './incremental-builder';

// Remote storage
export {
  type UpdateInfo,
  type RemoteIndexStorage,
  type DownloadOptions,
  type DownloadProgress,
  type StorageFactoryOptions,
  createRemoteStorage,
  LocalIndexStorage,
} from './remote-storage';

// Overlay manager
export {
  type OverlayManagerConfig,
  type OverlayStatus,
  OverlayManager,
  createOverlayManager,
} from './overlay-manager';
