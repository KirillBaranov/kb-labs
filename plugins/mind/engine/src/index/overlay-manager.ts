/**
 * @module @kb-labs/mind-engine/index/overlay-manager
 * Manages local overlay index on top of base index
 *
 * This is the main entry point for incremental indexing:
 * - Detects changed files via git diff
 * - Builds overlay for changed files
 * - Provides merged search across base + overlay
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { EmbeddingProvider } from '../types/embedding-provider';
import type { VectorStore } from '../vector-store/vector-store';
import { GitDiffDetector, type ChangedFile } from './git-diff';
import { MergedVectorStore, type MergedIndexStats } from './merged-store';
import { IncrementalIndexBuilder, type OverlayBuildResult } from './incremental-builder';
import { type IndexManifest, loadManifest, saveManifest } from './manifest';

/**
 * Overlay manager configuration
 */
export interface OverlayManagerConfig {
  /** Enable overlay feature */
  enabled: boolean;

  /** Auto-build overlay on query */
  autoOverlay: boolean;

  /** Maximum files to process in overlay */
  maxFiles: number;

  /** Overlay TTL in minutes (rebuild if older) */
  ttlMinutes: number;

  /** Workspace root */
  workspaceRoot: string;

  /** Index directory */
  indexDir: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: OverlayManagerConfig = {
  enabled: true,
  autoOverlay: true,
  maxFiles: 100,
  ttlMinutes: 60,
  workspaceRoot: process.cwd(),
  indexDir: '.kb/mind/indexes',
};

/**
 * Overlay state persisted to disk
 */
interface OverlayState {
  /** Base index revision */
  baseRevision: string;

  /** When overlay was built */
  builtAt: string;

  /** Changed files included in overlay */
  changedFiles: string[];

  /** Deleted paths */
  deletedPaths: string[];

  /** Number of chunks in overlay */
  chunkCount: number;
}

/**
 * Overlay manager status
 */
export interface OverlayStatus {
  /** Whether overlay feature is enabled */
  enabled: boolean;

  /** Whether base index exists */
  hasBaseIndex: boolean;

  /** Base index manifest */
  baseManifest?: IndexManifest;

  /** Whether overlay exists */
  hasOverlay: boolean;

  /** Overlay state */
  overlayState?: OverlayState;

  /** Whether overlay is stale (needs rebuild) */
  isStale: boolean;

  /** Stale reason */
  staleReason?: string;

  /** Current git revision */
  currentRevision?: string;

  /** Changed files since base */
  changedFiles?: ChangedFile[];

  /** Merged stats */
  mergedStats?: MergedIndexStats;
}

/**
 * Manages overlay index on top of base index
 */
export class OverlayManager {
  private readonly config: OverlayManagerConfig;
  private readonly git: GitDiffDetector;
  private readonly builder: IncrementalIndexBuilder;

  private baseStore: VectorStore | null = null;
  private overlayStore: VectorStore | null = null;
  private mergedStore: MergedVectorStore | null = null;
  private baseManifest: IndexManifest | null = null;
  private overlayState: OverlayState | null = null;

  constructor(config: Partial<OverlayManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.git = new GitDiffDetector({ cwd: this.config.workspaceRoot });
    this.builder = new IncrementalIndexBuilder();
  }

  /**
   * Initialize overlay manager with base and overlay stores
   */
  async initialize(
    baseStore: VectorStore,
    overlayStore: VectorStore,
    scopeId: string,
  ): Promise<void> {
    this.baseStore = baseStore;
    this.overlayStore = overlayStore;

    // Load base manifest if exists
    const manifestPath = this.getManifestPath(scopeId);
    try {
      this.baseManifest = await loadManifest(manifestPath);
    } catch {
      this.baseManifest = null;
    }

    // Load overlay state if exists
    const statePath = this.getOverlayStatePath(scopeId);
    try {
      const stateContent = await fs.readFile(statePath, 'utf8');
      this.overlayState = JSON.parse(stateContent);
    } catch {
      this.overlayState = null;
    }

    // Create merged store
    await this.rebuildMergedStore(scopeId);
  }

  /**
   * Get the effective vector store (merged or base)
   */
  getStore(): VectorStore {
    if (!this.config.enabled || !this.mergedStore) {
      if (!this.baseStore) {
        throw new Error('OverlayManager not initialized');
      }
      return this.baseStore;
    }
    return this.mergedStore;
  }

  /**
   * Check if overlay needs rebuild and rebuild if necessary
   */
  async ensureFresh(
    scopeId: string,
    embeddingProvider: EmbeddingProvider,
  ): Promise<{ rebuilt: boolean; stats?: OverlayBuildResult['stats'] }> {
    if (!this.config.enabled || !this.config.autoOverlay) {
      return { rebuilt: false };
    }

    if (!this.baseManifest) {
      // No base index - nothing to overlay
      return { rebuilt: false };
    }

    const status = await this.getStatus(scopeId);

    if (!status.isStale && status.hasOverlay) {
      return { rebuilt: false };
    }

    // Rebuild overlay
    const result = await this.buildOverlay(scopeId, embeddingProvider);
    return { rebuilt: true, stats: result.stats };
  }

  /**
   * Build or rebuild overlay for changed files
   */
  async buildOverlay(
    scopeId: string,
    embeddingProvider: EmbeddingProvider,
  ): Promise<OverlayBuildResult> {
    if (!this.baseManifest) {
      throw new Error('No base index to overlay');
    }

    if (!this.overlayStore) {
      throw new Error('OverlayManager not initialized');
    }

    // Get changed files since base revision
    const changedFiles = await this.git.getChangedFiles(this.baseManifest.gitRevision);

    // Also include uncommitted changes
    const uncommitted = await this.git.getUncommittedChanges();
    const allChanges = this.mergeChangedFiles(changedFiles, uncommitted);

    if (allChanges.length === 0) {
      // No changes - clear overlay
      await this.clearOverlay(scopeId);
      return {
        chunks: [],
        deletedPaths: [],
        modifiedPaths: [],
        stats: {
          filesProcessed: 0,
          filesSkipped: 0,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          timeMs: 0,
        },
      };
    }

    // Build overlay
    const result = await this.builder.buildOverlay(allChanges, {
      scopeId,
      workspaceRoot: this.config.workspaceRoot,
      embeddingProvider,
      maxFiles: this.config.maxFiles,
    });

    // Store overlay chunks
    await this.overlayStore.replaceScope(scopeId, result.chunks);

    // Save overlay state
    this.overlayState = {
      baseRevision: this.baseManifest.gitRevision,
      builtAt: new Date().toISOString(),
      changedFiles: result.modifiedPaths,
      deletedPaths: result.deletedPaths,
      chunkCount: result.chunks.length,
    };

    await this.saveOverlayState(scopeId);

    // Rebuild merged store
    await this.rebuildMergedStore(scopeId);

    return result;
  }

  /**
   * Clear overlay
   */
  async clearOverlay(scopeId: string): Promise<void> {
    if (this.overlayStore?.deleteScope) {
      await this.overlayStore.deleteScope(scopeId);
    } else if (this.overlayStore) {
      await this.overlayStore.replaceScope(scopeId, []);
    }

    this.overlayState = null;

    // Delete state file
    const statePath = this.getOverlayStatePath(scopeId);
    try {
      await fs.unlink(statePath);
    } catch {
      // Ignore if doesn't exist
    }

    await this.rebuildMergedStore(scopeId);
  }

  /**
   * Get overlay status
   */
  async getStatus(scopeId: string): Promise<OverlayStatus> {
    const status: OverlayStatus = {
      enabled: this.config.enabled,
      hasBaseIndex: !!this.baseManifest,
      baseManifest: this.baseManifest ?? undefined,
      hasOverlay: !!this.overlayState,
      overlayState: this.overlayState ?? undefined,
      isStale: false,
    };

    if (!this.config.enabled) {
      return status;
    }

    try {
      status.currentRevision = await this.git.getCurrentRevision();
    } catch {
      // Not a git repo
    }

    if (!this.baseManifest) {
      return status;
    }

    // Get changed files
    try {
      status.changedFiles = await this.git.getChangedFiles(this.baseManifest.gitRevision);

      // Include uncommitted
      const uncommitted = await this.git.getUncommittedChanges();
      status.changedFiles = this.mergeChangedFiles(status.changedFiles, uncommitted);
    } catch {
      status.changedFiles = [];
    }

    // Check staleness
    if (!this.overlayState) {
      if (status.changedFiles && status.changedFiles.length > 0) {
        status.isStale = true;
        status.staleReason = `${status.changedFiles.length} files changed since base index`;
      }
    } else {
      // Check TTL
      const builtAt = new Date(this.overlayState.builtAt);
      const ageMinutes = (Date.now() - builtAt.getTime()) / 1000 / 60;

      if (ageMinutes > this.config.ttlMinutes) {
        status.isStale = true;
        status.staleReason = `Overlay is ${Math.round(ageMinutes)} minutes old (TTL: ${this.config.ttlMinutes})`;
      }

      // Check if base changed
      if (this.overlayState.baseRevision !== this.baseManifest.gitRevision) {
        status.isStale = true;
        status.staleReason = 'Base index changed';
      }
    }

    // Get merged stats
    if (this.mergedStore) {
      try {
        status.mergedStats = await this.mergedStore.getStats(scopeId);
      } catch {
        // Ignore stats errors
      }
    }

    return status;
  }

  /**
   * Update base index reference (after pull)
   */
  async updateBase(
    scopeId: string,
    manifest: IndexManifest,
    clearOverlay: boolean = true,
  ): Promise<void> {
    this.baseManifest = manifest;

    // Save manifest
    const manifestPath = this.getManifestPath(scopeId);
    await saveManifest(manifest, manifestPath);

    if (clearOverlay) {
      await this.clearOverlay(scopeId);
    }

    await this.rebuildMergedStore(scopeId);
  }

  /**
   * Merge changed files from multiple sources
   */
  private mergeChangedFiles(
    ...sources: ChangedFile[][]
  ): ChangedFile[] {
    const pathMap = new Map<string, ChangedFile>();

    for (const files of sources) {
      for (const file of files) {
        pathMap.set(file.path, file);
      }
    }

    return Array.from(pathMap.values());
  }

  /**
   * Rebuild merged store from base + overlay
   */
  private async rebuildMergedStore(scopeId: string): Promise<void> {
    if (!this.baseStore || !this.overlayStore) {
      this.mergedStore = null;
      return;
    }

    const deletedPaths = new Set(this.overlayState?.deletedPaths ?? []);
    const modifiedPaths = new Set(this.overlayState?.changedFiles ?? []);

    this.mergedStore = new MergedVectorStore({
      base: this.baseStore,
      overlay: this.overlayStore,
      deletedPaths,
      modifiedPaths,
    });
  }

  /**
   * Get manifest path for scope
   */
  private getManifestPath(scopeId: string): string {
    return path.join(
      this.config.workspaceRoot,
      this.config.indexDir,
      scopeId,
      'manifest.json',
    );
  }

  /**
   * Get overlay state path for scope
   */
  private getOverlayStatePath(scopeId: string): string {
    return path.join(
      this.config.workspaceRoot,
      this.config.indexDir,
      scopeId,
      'overlay-state.json',
    );
  }

  /**
   * Save overlay state to disk
   */
  private async saveOverlayState(scopeId: string): Promise<void> {
    if (!this.overlayState) {return;}

    const statePath = this.getOverlayStatePath(scopeId);
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(this.overlayState, null, 2));
  }
}

/**
 * Create overlay manager with config
 */
export function createOverlayManager(
  config?: Partial<OverlayManagerConfig>,
): OverlayManager {
  return new OverlayManager(config);
}
