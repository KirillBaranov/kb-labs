/**
 * @module @kb-labs/core-types/telemetry
 * Telemetry abstraction for KB Labs ecosystem
 * 
 * This module provides a product-agnostic interface for telemetry/analytics,
 * allowing core packages to emit events without depending on specific implementations.
 */

/**
 * Result of emitting a telemetry event
 */
export interface TelemetryEmitResult {
  /** Whether the event was queued for delivery */
  queued: boolean;
  /** Reason if event was not queued */
  reason?: string;
}

/**
 * Telemetry event payload (product-agnostic)
 */
export interface TelemetryEvent {
  /** Event type/name */
  type?: string;
  /** Event payload data */
  payload?: Record<string, unknown>;
  /** Run/execution ID for grouping events */
  runId?: string;
  /** Actor information */
  actor?: {
    type: string;
    id: string;
    name?: string;
  };
  /** Context information */
  ctx?: {
    workspace?: string;
    command?: string;
    [key: string]: unknown;
  };
  /** Timestamp (ISO string) */
  timestamp?: string;
  /** Additional event data */
  [key: string]: unknown;
}

/**
 * Telemetry emitter interface
 * 
 * Implementations should never throw - failures should be handled gracefully
 * and returned as part of TelemetryEmitResult.
 */
export interface TelemetryEmitter {
  /**
   * Emit a telemetry event
   * @param event Event to emit
   * @returns Result indicating success/failure
   */
  emit(event: Partial<TelemetryEvent>): Promise<TelemetryEmitResult>;
}

/**
 * No-op telemetry emitter (for when telemetry is disabled or not available)
 */
export class NoOpTelemetryEmitter implements TelemetryEmitter {
  async emit(_event: Partial<TelemetryEvent>): Promise<TelemetryEmitResult> {
    return { queued: false, reason: 'Telemetry disabled' };
  }
}

/**
 * Create a no-op telemetry emitter
 */
export function createNoOpTelemetryEmitter(): TelemetryEmitter {
  return new NoOpTelemetryEmitter();
}

