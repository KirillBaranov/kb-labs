/**
 * @module @kb-labs/core-sandbox/types/adapter-context
 * Adapter-specific context types
 */

import type { Output } from '@kb-labs/core-sys/output';

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Runtime API for plugin handlers (compatible with @kb-labs/plugin-runtime RuntimeAPI)
 * Provides low-level system APIs (fetch, fs, env, shell, invoke, artifacts)
 * 
 * Note: This is a local type definition to avoid circular dependencies.
 * It should match RuntimeAPI from @kb-labs/plugin-runtime.
 */
export type RuntimeAPI = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  fs: Record<string, unknown>; // FSLike from plugin-runtime
  env: (key: string) => string | undefined;
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ) => void;
  invoke: <T = unknown>(request: Record<string, unknown>) => Promise<T>;
  artifacts: {
    read: (request: Record<string, unknown>) => Promise<Buffer | object>;
    write: (request: Record<string, unknown>) => Promise<{ path: string; meta: Record<string, unknown> }>;
  };
  shell: {
    exec: (command: string, args: string[], options?: Record<string, unknown>) => Promise<{ code: number; stdout: string; stderr: string; ok: boolean }>;
    spawn: (command: string, args: string[], options?: Record<string, unknown>) => Promise<{ code: number; stdout: string; stderr: string; ok: boolean }>;
  };
  analytics?: (event: Record<string, unknown>) => Promise<void>;
  events?: {
    emit<T = unknown>(topic: string, payload: T, options?: Record<string, unknown>): Promise<void>;
    on<T = unknown>(topic: string, handler: (event: T) => void | Promise<void>, options?: Record<string, unknown>): () => void;
    once<T = unknown>(topic: string, handler: (event: T) => void | Promise<void>, options?: Record<string, unknown>): () => void;
    off(topic: string, handler?: (event: unknown) => void | Promise<void>, options?: Record<string, unknown>): void;
    waitFor<T = unknown>(topic: string, predicate?: (event: T) => boolean, options?: Record<string, unknown>): Promise<T>;
  };
  config: {
    ensureSection: (section: string) => Record<string, unknown>;
  };
};

/**
 * Base context shared by all handlers
 */
export interface BaseHandlerContext {
  requestId: string;
  workdir: string;
  outdir?: string;
  pluginId?: string;
  pluginVersion?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  debug?: boolean;
}

/**
 * CLI-specific handler context
 */
export interface CliHandlerContext<TConfig = Record<string, unknown>> extends BaseHandlerContext {
  type: 'cli';
  output: Output; // ✅ Unified Output interface (for user-facing messages)
  logger?: Logger; // ✅ Unified Logger interface (for structured logging)
  presenter: {    // ⚠️ Deprecated, kept for backwards compatibility
    write: (text: string) => void;
    error: (text: string) => void;
    info: (text: string) => void;
    json: (data: unknown) => void;
  };
  cwd: string;
  flags: Record<string, unknown>;
  argv: string[];
  /**
   * Product configuration (auto-loaded from kb.config.json)
   * Available when command is executed via plugin adapter
   */
  config?: TConfig;
  /**
   * Active profile ID (Profiles v2)
   * Auto-selected from KB_PROFILE env var or defaults to "default"
   */
  profileId?: string;
  // Note: runtime is available via ctx.extensions (deprecated) in subprocess mode
  // In in-process mode, runtime may be available directly, but use extensions for compatibility
}

/**
 * REST-specific handler context
 */
export interface RestHandlerContext extends BaseHandlerContext {
  type: 'rest';
  request?: Record<string, unknown>; // Fastify request or similar
}

/**
 * Job-specific handler context (for cron jobs and scheduled tasks)
 */
export interface JobHandlerContext extends BaseHandlerContext {
  type: 'job';
  /** Sandboxed runtime APIs (fs, fetch, env) */
  runtime?: RuntimeAPI;
  /** Output interface for logging */
  output?: Output;
  /** API groups from buildRuntime */
  api?: Record<string, unknown>;
}

/**
 * Union type for all adapter contexts
 */
export type HandlerContext = CliHandlerContext | RestHandlerContext | JobHandlerContext;

/**
 * Type guard for job context
 */
export function isJobContext(ctx: HandlerContext): ctx is JobHandlerContext {
  return ctx.type === 'job';
}

/**
 * Adapter metadata
 */
export interface AdapterMetadata {
  /** Adapter type (extensible string, not enum) */
  type: string; // 'cli' | 'rest' | 'webhook' | 'graphql' | ...
  
  /** Handler signature type */
  signature: 'command' | 'request' | string; // extensible
  
  /** Adapter version (semver) */
  version: string; // '1.0.0'
  
  /** Adapter-specific metadata (extensible) */
  meta?: Record<string, unknown>;
}

/**
 * Type guards for adapter contexts
 */
export function isCliContext(ctx: HandlerContext): ctx is CliHandlerContext {
  return ctx.type === 'cli';
}

export function isRestContext(ctx: HandlerContext): ctx is RestHandlerContext {
  return ctx.type === 'rest';
}



