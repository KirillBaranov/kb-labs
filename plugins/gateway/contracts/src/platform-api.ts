/**
 * @module @kb-labs/gateway-contracts/platform-api
 * Unified Platform API — single dispatch endpoint for any adapter.
 *
 * Route: POST /platform/v1/{adapter}/{method}
 * Adapter and method come from URL params; args come from the request body.
 */
import { z } from 'zod';

// ── Request ─────────────────────────────────────────────────────────────────

export const PlatformCallRequestSchema = z.object({
  /** Arguments to pass to the adapter method. Order matters. */
  args: z.array(z.unknown()).default([]),
});

export type PlatformCallRequest = z.infer<typeof PlatformCallRequestSchema>;

// ── Response ────────────────────────────────────────────────────────────────

export interface PlatformCallResponse {
  ok: boolean;
  result?: unknown;
  error?: { message: string; code?: string };
  /** Wall-clock duration of the adapter call in milliseconds. */
  durationMs: number;
}
