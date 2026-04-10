import type { SuccessEnvelope } from './envelopes';

/**
 * Adapter value can be:
 * - string: single adapter package
 * - string[]: multiple adapters (first = primary)
 * - null: disabled/NoOp
 */
export type AdapterValue = string | string[] | null;

/**
 * Platform configuration snapshot.
 * Returns current platform adapters and their options (redacted for sensitive data).
 */
export interface PlatformConfigPayload {
  schema: 'kb.platform.config/1';
  ts: string;
  /** Adapter packages (can be string, string[], or null for each key) */
  adapters: Record<string, AdapterValue>;
  adapterOptions: Record<string, unknown>;
  execution: {
    mode: string;
  };
  /** List of keys that were redacted from adapterOptions */
  redacted: string[];
}

export type PlatformConfigResponse = SuccessEnvelope<PlatformConfigPayload>;
