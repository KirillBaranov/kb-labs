/**
 * GatewayHostResolver — resolves ExecutionTarget to a hostId via Gateway REST API.
 *
 * Implements IHostResolver from core-contracts.
 * This is the only place that knows about Gateway HTTP — execution layer
 * only sees the IHostResolver interface.
 */

import type { IHostResolver, HostResolution, ExecutionTarget } from '@kb-labs/core-contracts';

export interface GatewayHostResolverOptions {
  /** Gateway base URL (e.g., http://localhost:4000) */
  gatewayUrl: string;
  /** Internal secret for Gateway auth */
  internalSecret: string;
  /** Request timeout in ms (default: 5000) */
  timeoutMs?: number;
  /** Optional logger for diagnostics */
  logger?: { warn(msg: string, meta?: Record<string, unknown>): void };
}

export class GatewayHostResolver implements IHostResolver {
  private readonly url: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly logger?: GatewayHostResolverOptions['logger'];

  constructor(options: GatewayHostResolverOptions) {
    if (!options.internalSecret) {
      throw new Error('GatewayHostResolver: internalSecret is required');
    }
    this.url = `${options.gatewayUrl.replace(/\/$/, '')}/internal/resolve-host`;
    this.secret = options.internalSecret;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.logger = options.logger;
  }

  async resolve(target: ExecutionTarget): Promise<HostResolution | null> {
    const namespaceId = target.namespace ?? 'default';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': this.secret,
        },
        body: JSON.stringify({ namespaceId, target }),
        signal: controller.signal,
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        this.logger?.warn('Host resolution failed', { status: response.status, url: this.url });
        return null;
      }

      const body = await response.json() as Record<string, unknown>;

      // Validate response shape
      if (typeof body.hostId !== 'string' || !body.hostId) {
        this.logger?.warn('Invalid resolve-host response: missing hostId', { body });
        return null;
      }

      return {
        hostId: body.hostId,
        strategy: (typeof body.strategy === 'string' ? body.strategy : target.hostSelection ?? 'any-matching') as HostResolution['strategy'],
        namespaceId: typeof body.namespaceId === 'string' ? body.namespaceId : namespaceId,
      };
    } catch (err) {
      this.logger?.warn('Host resolution error', {
        error: err instanceof Error ? err.message : String(err),
        url: this.url,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
