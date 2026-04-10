/**
 * @module @kb-labs/core-runtime/snapshot-manager
 * Runtime manager for snapshot providers.
 */

import type {
  ISnapshotProvider,
  CaptureSnapshotRequest,
  SnapshotDescriptor,
  RestoreSnapshotRequest,
  RestoreSnapshotResult,
  SnapshotStatusResult,
  SnapshotGarbageCollectRequest,
  SnapshotGarbageCollectResult,
  SnapshotProviderCapabilities,
} from '@kb-labs/core-platform';
import type { PlatformContainer } from './container.js';

export class SnapshotManager {
  constructor(
    private readonly platform: Pick<PlatformContainer, 'getAdapter'>
  ) {}

  /**
   * Check whether snapshot provider is configured.
   */
  hasProvider(): boolean {
    return !!this.platform.getAdapter<ISnapshotProvider>('snapshot');
  }

  /**
   * Capture a new snapshot.
   */
  async captureSnapshot(
    request: CaptureSnapshotRequest
  ): Promise<SnapshotDescriptor> {
    const provider = this.getProviderOrThrow();
    return provider.capture(request);
  }

  /**
   * Restore an existing snapshot.
   */
  async restoreSnapshot(
    request: RestoreSnapshotRequest
  ): Promise<RestoreSnapshotResult> {
    const provider = this.getProviderOrThrow();
    return provider.restore(request);
  }

  /**
   * Read snapshot status.
   */
  async getSnapshotStatus(snapshotId: string): Promise<SnapshotStatusResult> {
    const provider = this.getProviderOrThrow();
    return provider.getStatus(snapshotId);
  }

  /**
   * Delete snapshot by id.
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const provider = this.getProviderOrThrow();
    await provider.delete(snapshotId);
  }

  /**
   * Run garbage collection if provider supports it.
   */
  async garbageCollectSnapshots(
    request: SnapshotGarbageCollectRequest = {}
  ): Promise<SnapshotGarbageCollectResult> {
    const provider = this.getProviderOrThrow();
    if (!provider.garbageCollect) {
      throw new Error('Configured snapshot provider does not support garbage collection');
    }
    return provider.garbageCollect(request);
  }

  /**
   * Read provider capabilities.
   */
  getCapabilities(): SnapshotProviderCapabilities {
    const provider = this.getProviderOrThrow();
    return provider.getCapabilities?.() ?? {};
  }

  /**
   * Shutdown manager resources (reserved for future internal workers).
   */
  async shutdown(): Promise<void> {
    // No background resources yet.
  }

  private getProviderOrThrow(): ISnapshotProvider {
    const provider = this.platform.getAdapter<ISnapshotProvider>('snapshot');
    if (!provider) {
      throw new Error(
        'Snapshot provider not configured. ' +
        'Configure platform.adapters.snapshot with an adapter implementing ISnapshotProvider.'
      );
    }
    return provider;
  }
}
