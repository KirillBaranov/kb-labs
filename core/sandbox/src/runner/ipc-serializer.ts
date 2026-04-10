/**
 * @module @kb-labs/core-sandbox/runner/ipc-serializer
 * IPC-safe serialization for ExecutionContext
 * 
 * Functions and callbacks cannot be serialized via IPC, so we extract
 * only serializable data and recreate shims in the subprocess.
 */

import type { ExecutionContext } from '../types/index';
import type { AdapterMetadata } from '../types/adapter-context';

/**
 * Serializable subset of ExecutionContext
 * Contains only data that can be sent via IPC (no functions)
 */
export interface SerializableContext {
  requestId: string;
  workdir: string;
  outdir?: string;
  pluginRoot?: string;
  pluginId?: string;
  pluginVersion?: string;
  configSection?: string; // Config section for useConfig() auto-detection
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  debug?: boolean;
  debugLevel?: 'verbose' | 'inspect' | 'profile';
  dryRun?: boolean;
  user?: { id?: string };

  // Adapter metadata (serializable)
  adapterMeta?: AdapterMetadata;

  // Serialized adapter context (no functions)
  adapterContextData?: Record<string, unknown>;

  // Context version for compatibility checking
  version?: string;

  // Extension data (serializable only)
  extensionsData?: Record<string, unknown>;

  // Platform configuration for worker initialization
  platformConfig?: any; // PlatformConfig from @kb-labs/core-runtime
}

/**
 * Serialize ExecutionContext to IPC-safe format
 * Extracts only serializable fields, excludes functions and callbacks
 */
export function serializeContext(ctx: ExecutionContext): SerializableContext {
  // Handle undefined ctx gracefully (should not happen, but defensive programming)
  if (!ctx) {
    throw new Error('Cannot serialize undefined context');
  }

  const serializable: SerializableContext = {
    requestId: ctx.requestId,
    workdir: ctx.workdir,
    outdir: ctx.outdir,
    pluginRoot: ctx.pluginRoot,
    pluginId: ctx.pluginId,
    pluginVersion: ctx.pluginVersion,
    configSection: ctx.configSection, // For useConfig() auto-detection
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: ctx.parentSpanId,
    debug: ctx.debug,
    debugLevel: ctx.debugLevel, // Can be undefined, which is fine
    dryRun: ctx.dryRun,
    user: ctx.user,
    version: (ctx as any).version,
  };
  
  // Serialize adapter metadata
  if (ctx.adapterMeta) {
    serializable.adapterMeta = ctx.adapterMeta;
  }
  
  // Extract serializable data from adapter context
  if (ctx.adapterContext) {
    const adapterCtx = ctx.adapterContext as any;
    serializable.adapterContextData = {
      type: adapterCtx.type,
      // CLI-specific fields
      cwd: adapterCtx.cwd,
      flags: adapterCtx.flags || {}, // Ensure flags is always an object
      argv: adapterCtx.argv || [], // Ensure argv is always an array
      // REST-specific fields
      request: adapterCtx.request ? {
        // Only serialize request metadata, not full request object
        method: adapterCtx.request.method,
        url: adapterCtx.request.url,
        headers: adapterCtx.request.headers,
      } : undefined,
    };
  }
  
  // Serialize extension data (only if it's serializable)
  if (ctx.extensions) {
    const extensionsData: Record<string, unknown> = {};
    const MAX_EXTENSION_SIZE = 100 * 1024; // 100KB limit
    
    for (const [key, value] of Object.entries(ctx.extensions)) {
      // Only include serializable values
      if (value !== null && typeof value !== 'function') {
        try {
          // CRITICAL: Estimate size WITHOUT creating full string to prevent OOM
          // Use recursive size estimation instead of JSON.stringify
          const estimatedSize = estimateSerializedSize(value);
          
          // SAFETY: Skip extensions larger than 100KB to prevent IPC OOM
          if (estimatedSize > MAX_EXTENSION_SIZE) {
            // Only log in debug mode to avoid memory issues
            if (ctx.debug) {
              console.warn(`⚠️  SERIALIZE: Skipping extension "${key}" - too large (${(estimatedSize / 1024).toFixed(2)} KB > 100 KB)`);
            }
            continue;
          }

          extensionsData[key] = value;
        } catch {
          // Skip non-serializable values silently
        }
      }
    }
    if (ctx.extensions.events) {
      extensionsData.events = {
        hasLocal: Boolean((ctx.extensions.events as any).local),
        hasPlugin: Boolean((ctx.extensions.events as any).plugin),
        config: (ctx.extensions.events as any).config,
      };
    }
    if (Object.keys(extensionsData).length > 0) {
      serializable.extensionsData = extensionsData;
    }
  }

  // Include platform config if available (for worker initialization)
  if (ctx.platformConfig) {
    serializable.platformConfig = ctx.platformConfig;
  }

  return serializable;
}

/**
 * Estimate serialized size without actually stringifying
 * Prevents OOM from creating large string copies
 */
function estimateSerializedSize(value: unknown): number {
  if (value === null || value === undefined) {
    return 4; // "null"
  }
  
  if (typeof value === 'string') {
    // String size: quotes + escaped characters
    return value.length + 2 + (value.match(/["\\\n\r\t]/g)?.length || 0);
  }
  
  if (typeof value === 'number') {
    return 20; // Approximate max number size
  }
  
  if (typeof value === 'boolean') {
    return value ? 4 : 5; // "true" or "false"
  }
  
  if (Array.isArray(value)) {
    // Array overhead: brackets + commas
    let size = 2; // []
    for (const item of value) {
      size += estimateSerializedSize(item) + 1; // +1 for comma
    }
    return size;
  }
  
  if (typeof value === 'object') {
    // Object overhead: braces + colons + commas
    let size = 2; // {}
    const entries = Object.entries(value);
    for (const [key, val] of entries) {
      // Key: quotes + escaped chars + colon
      size += key.length + 2 + (key.match(/["\\]/g)?.length || 0) + 1;
      // Value
      size += estimateSerializedSize(val) + 1; // +1 for comma
    }
    return size;
  }
  
  return 100; // Fallback estimate
}

