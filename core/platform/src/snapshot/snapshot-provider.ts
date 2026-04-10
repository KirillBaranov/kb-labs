/**
 * @module @kb-labs/core-platform/snapshot/snapshot-provider
 * Snapshot lifecycle abstraction.
 *
 * This port captures/restores point-in-time workspace or environment state.
 */

export type SnapshotStatus =
  | "pending"
  | "capturing"
  | "ready"
  | "restoring"
  | "deleted"
  | "failed";

export interface CaptureSnapshotRequest {
  snapshotId?: string;
  workspaceId?: string;
  environmentId?: string;
  sourcePath?: string;
  namespace?: string;
  metadata?: Record<string, unknown>;
}

export interface SnapshotDescriptor {
  snapshotId: string;
  provider: string;
  status: SnapshotStatus;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
  environmentId?: string;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
}

export interface RestoreSnapshotRequest {
  snapshotId: string;
  workspaceId?: string;
  environmentId?: string;
  targetPath?: string;
  overwrite?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RestoreSnapshotResult {
  snapshotId: string;
  restoredAt: string;
  workspaceId?: string;
  environmentId?: string;
  targetPath?: string;
  metadata?: Record<string, unknown>;
}

export interface SnapshotStatusResult {
  snapshotId: string;
  status: SnapshotStatus;
  reason?: string;
  updatedAt: string;
}

export interface SnapshotGarbageCollectRequest {
  namespace?: string;
  before?: string;
  limit?: number;
  dryRun?: boolean;
}

export interface SnapshotGarbageCollectResult {
  scanned: number;
  deleted: number;
  dryRun: boolean;
}

export interface SnapshotProviderCapabilities {
  supportsWorkspaceSnapshots?: boolean;
  supportsEnvironmentSnapshots?: boolean;
  supportsGarbageCollection?: boolean;
  supportsIncrementalSnapshots?: boolean;
  custom?: Record<string, unknown>;
}

export interface ISnapshotProvider {
  capture(request: CaptureSnapshotRequest): Promise<SnapshotDescriptor>;
  restore(request: RestoreSnapshotRequest): Promise<RestoreSnapshotResult>;
  getStatus(snapshotId: string): Promise<SnapshotStatusResult>;
  delete(snapshotId: string): Promise<void>;
  garbageCollect?(request: SnapshotGarbageCollectRequest): Promise<SnapshotGarbageCollectResult>;
  getCapabilities?(): SnapshotProviderCapabilities;
}
