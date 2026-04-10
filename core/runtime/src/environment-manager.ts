/**
 * @module @kb-labs/core-runtime/environment-manager
 * Runtime manager for long-lived environment providers.
 */

import type {
  IEnvironmentProvider,
  CreateEnvironmentRequest,
  EnvironmentDescriptor,
  EnvironmentStatusResult,
  EnvironmentLease,
} from '@kb-labs/core-platform';
import type { ISQLDatabase } from '@kb-labs/core-platform/adapters';
import { randomUUID } from 'node:crypto';
import type { PlatformContainer } from './container.js';
import { EnvironmentLeaseStore } from './environment-lease-store.js';

export interface EnvironmentManagerOptions {
  janitorIntervalMs?: number;
  janitorBatchSize?: number;
}

/**
 * Environment manager facade over `environment` adapter token.
 *
 * Keeps provider access in one place and centralizes diagnostics.
 */
export class EnvironmentManager {
  private readonly store?: EnvironmentLeaseStore;
  private readonly janitorIntervalMs: number;
  private readonly janitorBatchSize: number;
  private janitorTimer?: NodeJS.Timeout;

  constructor(
    private readonly platform: Pick<PlatformContainer, 'getAdapter' | 'logger'>,
    options: EnvironmentManagerOptions = {}
  ) {
    const db = this.platform.getAdapter<ISQLDatabase>('sqlDatabase');
    if (db) {
      this.store = new EnvironmentLeaseStore(db);
    }

    this.janitorIntervalMs = options.janitorIntervalMs ?? 60_000;
    this.janitorBatchSize = options.janitorBatchSize ?? 25;
  }

  /**
   * Check whether environment provider is configured.
   */
  hasProvider(): boolean {
    return !!this.platform.getAdapter<IEnvironmentProvider>('environment');
  }

  /**
   * Create environment using configured provider.
   */
  async createEnvironment(request: CreateEnvironmentRequest): Promise<EnvironmentDescriptor> {
    const provider = this.getProviderOrThrow();
    const environment = await provider.create(request);
    const now = new Date().toISOString();

    await this.safePersist(async () => this.persistLeaseState(environment, request.runId, 'active', now), {
      operation: 'persistLeaseState',
      environmentId: environment.environmentId,
      runId: request.runId,
    });
    await this.safePersist(async () => this.appendEvent({
      environmentId: environment.environmentId,
      runId: request.runId,
      type: 'environment.created',
      at: now,
      payload: {
        provider: environment.provider,
        status: environment.status,
      },
    }), {
      operation: 'appendEvent',
      environmentId: environment.environmentId,
      runId: request.runId,
      eventType: 'environment.created',
    });

    this.platform.logger.debug('Environment created', {
      environmentId: environment.environmentId,
      provider: environment.provider,
      status: environment.status,
      runId: request.runId,
      templateId: request.templateId,
    });

    return environment;
  }

  /**
   * Get environment status.
   */
  async getEnvironmentStatus(environmentId: string): Promise<EnvironmentStatusResult> {
    const provider = this.getProviderOrThrow();
    return provider.getStatus(environmentId);
  }

  /**
   * Destroy environment.
   */
  async destroyEnvironment(environmentId: string, reason?: string): Promise<void> {
    const provider = this.getProviderOrThrow();
    await provider.destroy(environmentId, reason);
    const now = new Date().toISOString();

    await this.safePersist(
      async () => this.store?.markTerminated(environmentId, now, reason),
      {
        operation: 'markTerminated',
        environmentId,
        reason,
      }
    );
    await this.safePersist(async () => this.appendEvent({
      environmentId,
      type: 'environment.destroyed',
      at: now,
      reason,
    }), {
      operation: 'appendEvent',
      environmentId,
      reason,
      eventType: 'environment.destroyed',
    });

    this.platform.logger.debug('Environment destroyed', {
      environmentId,
      reason,
    });
  }

  /**
   * Renew environment lease if provider supports it.
   */
  async renewEnvironmentLease(
    environmentId: string,
    ttlMs: number
  ): Promise<EnvironmentLease> {
    const provider = this.getProviderOrThrow();
    if (!provider.renewLease) {
      throw new Error('Configured environment provider does not support lease renewal');
    }
    const lease = await provider.renewLease(environmentId, ttlMs);
    const status = await this.getEnvironmentStatus(environmentId).catch(() => undefined);

    await this.safePersist(
      async () => this.persistLeaseState(
        {
          environmentId,
          provider: 'unknown',
          status: status?.status ?? 'ready',
          createdAt: lease.acquiredAt,
          updatedAt: new Date().toISOString(),
          lease,
        },
        lease.owner,
        'active',
        new Date().toISOString()
      ),
      {
        operation: 'persistLeaseState',
        environmentId,
        runId: lease.owner,
      }
    );
    await this.safePersist(async () => this.appendEvent({
      environmentId,
      runId: lease.owner,
      type: 'environment.lease.renewed',
      at: new Date().toISOString(),
      payload: {
        expiresAt: lease.expiresAt,
      },
    }), {
      operation: 'appendEvent',
      environmentId,
      runId: lease.owner,
      eventType: 'environment.lease.renewed',
    });

    return lease;
  }

  /**
   * Start periodic cleanup for expired leases.
   */
  startJanitor(): void {
    if (!this.store || this.janitorTimer) {
      return;
    }

    this.janitorTimer = setInterval(() => {
      void this.cleanupExpiredLeases();
    }, this.janitorIntervalMs);

    this.janitorTimer.unref?.();
    this.platform.logger.debug('Environment janitor started', {
      intervalMs: this.janitorIntervalMs,
      batchSize: this.janitorBatchSize,
    });
  }

  /**
   * Stop janitor timer.
   */
  async shutdown(): Promise<void> {
    if (this.janitorTimer) {
      clearInterval(this.janitorTimer);
      this.janitorTimer = undefined;
    }
  }

  /**
   * Cleanup expired active leases.
   */
  async cleanupExpiredLeases(now: Date = new Date()): Promise<number> {
    if (!this.store) {
      return 0;
    }

    const expired = await this.store.findExpiredActiveLeases(
      now.toISOString(),
      this.janitorBatchSize
    );

    let cleaned = 0;
    for (const lease of expired) {
      try {
        await this.destroyEnvironment(lease.environmentId, 'lease_expired');
        cleaned++;
      } catch (error) {
        this.platform.logger.warn('Environment janitor failed to cleanup lease', {
          environmentId: lease.environmentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (cleaned > 0) {
      this.platform.logger.debug('Environment janitor cleanup complete', {
        cleaned,
      });
    }

    return cleaned;
  }

  private getProviderOrThrow(): IEnvironmentProvider {
    const provider = this.platform.getAdapter<IEnvironmentProvider>('environment');
    if (!provider) {
      throw new Error(
        'Environment provider not configured. ' +
        'Configure platform.adapters.environment with an adapter implementing IEnvironmentProvider.'
      );
    }
    return provider;
  }

  private async persistLeaseState(
    environment: EnvironmentDescriptor,
    runId: string | undefined,
    status: 'active' | 'terminated' | 'failed',
    nowIso: string
  ): Promise<void> {
    if (!this.store) {
      return;
    }

    await this.store.upsertLease({
      environmentId: environment.environmentId,
      runId,
      status,
      provider: environment.provider,
      acquiredAt: environment.lease?.acquiredAt ?? environment.createdAt,
      expiresAt: environment.lease?.expiresAt ?? nowIso,
      metadataJson: environment.metadata
        ? JSON.stringify(environment.metadata)
        : null,
      releasedAt: status === 'active' ? null : nowIso,
    });
  }

  private async appendEvent(input: {
    environmentId: string;
    runId?: string;
    type: string;
    at: string;
    reason?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.store) {
      return;
    }

    await this.store.appendEvent({
      id: randomUUID(),
      environmentId: input.environmentId,
      runId: input.runId,
      type: input.type,
      at: input.at,
      reason: input.reason,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    });
  }

  private async safePersist(
    operation: () => Promise<void | unknown>,
    context: Record<string, unknown>
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      this.platform.logger.warn('Environment persistence operation failed', {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
