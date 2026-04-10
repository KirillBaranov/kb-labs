import { z } from 'zod';
import type { PermissionDiff, PermissionSummary } from './error-code';

export interface EnvelopeMeta {
  requestId: string;
  durationMs: number;
  apiVersion: string;
  [key: string]: unknown;
}

export type SuccessEnvelope<T = unknown> = {
  ok: true;
  data: T;
  meta?: EnvelopeMeta;
};

export type ErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    cause?: unknown;
    traceId?: string;
  };
  meta: EnvelopeMeta;
};

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    cause: z.unknown().optional(),
    traceId: z.string().optional(),
  }),
  meta: z.object({
    requestId: z.string(),
    durationMs: z.number(),
    apiVersion: z.string(),
  }),
});

/**
 * Structured error produced by the plugin runtime.
 */
export interface PluginErrorEnvelope {
  status: 'error';
  http: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  trace?: string;
  meta: {
    requestId: string;
    pluginId: string;
    pluginVersion: string;
    routeOrCommand: string;
    timeMs: number;
    cpuMs?: number;
    memMb?: number;
    perms?: PermissionSummary | PermissionDiff | Record<string, unknown>;
  };
}


