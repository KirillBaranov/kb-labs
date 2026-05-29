/**
 * Request handler logic for the MCP endpoint, extracted from the Fastify/MCP-SDK
 * shell so every authorization and caching branch is unit-testable without
 * spinning up an HTTP server or a transport.
 *
 * server.ts wires these pure(ish) functions to the MCP SDK request handlers;
 * the SDK/transport plumbing itself is exercised by the e2e suite.
 */

import { createHash } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ICache } from '@kb-labs/core-platform';
import type { IEntityRegistry } from '@kb-labs/core-registry';
import { filterTools, type McpTool } from './tool-builder.js';
import { callTool, type PlatformResolver } from './tool-router.js';
import type { Permits } from './authz.js';

/** How long a per-identity tool listing stays cached. */
export const TOOLS_CACHE_TTL_MS = 60_000;

/** Build a text-only MCP tool result (the only content shape this daemon emits). */
function textResult(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: 'text', text }], isError };
}

/**
 * Cache key for an identity's visible tool list. Authenticated identities are
 * keyed by a hash of their Authorization header (per-token, per-tenant
 * isolation); everything else shares the single anonymous bucket.
 */
export function toolsCacheKey(authHeader: string | null | undefined): string {
  if (!authHeader) {
    return 'mcp:tools:anonymous';
  }
  return `mcp:tools:${createHash('sha256').update(authHeader).digest('hex').slice(0, 16)}`;
}

export interface ResolveVisibleToolsArgs {
  /** Identity-bound authorization predicate, or null for anonymous callers. */
  permits: Permits | null;
  /** Raw Authorization header — only used to derive the per-token cache key. */
  authHeader: string | null | undefined;
  registry: IEntityRegistry;
  cache: ICache;
}

/**
 * Resolve the tools an identity may see. Cached per identity for 60s; the cache
 * is a LISTING optimization only — it is never the authority for execution
 * (executeToolCall re-checks the live policy). Anonymous callers (permits=null)
 * always get an empty list and never touch the registry.
 */
export async function resolveVisibleTools(args: ResolveVisibleToolsArgs): Promise<McpTool[]> {
  const { permits, authHeader, registry, cache } = args;
  // Anonymous identities share one bucket regardless of any (invalid) header.
  const cacheKey = toolsCacheKey(permits ? authHeader : null);

  const cached = await cache.get<McpTool[]>(cacheKey).catch(() => null);
  if (cached) {
    return cached;
  }

  const tools = permits ? filterTools(registry.snapshot(), permits) : [];
  await cache.set(cacheKey, tools, TOOLS_CACHE_TTL_MS).catch(() => {});
  return tools;
}

export interface ExecuteToolCallArgs {
  name: string;
  args: Record<string, unknown>;
  visibleTools: McpTool[];
  /** Identity-bound predicate, or null for anonymous. */
  permits: Permits | null;
  tenantId: string;
  resolvePlatform: PlatformResolver;
}

/**
 * Execute a tool call. Two independent gates protect execution:
 *   1. the tool must be in the caller's visible set, and
 *   2. the LIVE policy must still permit it (re-checked here, not trusted from
 *      the possibly-stale cached listing).
 * Only then is the command run via executeCommandV3.
 */
export async function executeToolCall(args: ExecuteToolCallArgs): Promise<CallToolResult> {
  const { name, visibleTools, permits, tenantId, resolvePlatform } = args;

  const tool = visibleTools.find((t) => t.name === name);
  if (!tool) {
    return textResult(`Unknown tool: ${name}`, true);
  }

  // Authoritative gate — independent of the cached visibility list. When the
  // platform supplies a real policy, a tool that became forbidden after it was
  // cached is rejected here with no server code change.
  if (!permits || !permits(tool.operationType, tool.pluginId)) {
    return textResult(`Not authorized: ${name}`, true);
  }

  const result = await callTool(tool, args.args, tenantId, resolvePlatform);
  return textResult(result.output, !result.success);
}
