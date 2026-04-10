/**
 * Snapshot API for plugin-controlled snapshot lifecycle.
 */

export type SnapshotStatus =
  | 'pending'
  | 'capturing'
  | 'ready'
  | 'restoring'
  | 'deleted'
  | 'failed';

export interface SnapshotCaptureRequest {
  snapshotId?: string;
  workspaceId?: string;
  environmentId?: string;
  sourcePath?: string;
  namespace?: string;
  metadata?: Record<string, unknown>;
}

export interface SnapshotInfo {
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

export interface SnapshotRestoreRequest {
  snapshotId: string;
  workspaceId?: string;
  environmentId?: string;
  targetPath?: string;
  overwrite?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SnapshotRestoreInfo {
  snapshotId: string;
  restoredAt: string;
  workspaceId?: string;
  environmentId?: string;
  targetPath?: string;
  metadata?: Record<string, unknown>;
}

export interface SnapshotStatusInfo {
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

export interface SnapshotGarbageCollectInfo {
  scanned: number;
  deleted: number;
  dryRun: boolean;
}

export interface SnapshotAPI {
  capture(request: SnapshotCaptureRequest): Promise<SnapshotInfo>;
  restore(request: SnapshotRestoreRequest): Promise<SnapshotRestoreInfo>;
  status(snapshotId: string): Promise<SnapshotStatusInfo>;
  delete(snapshotId: string): Promise<void>;
  gc(request?: SnapshotGarbageCollectRequest): Promise<SnapshotGarbageCollectInfo>;
}
