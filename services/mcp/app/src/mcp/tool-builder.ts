/**
 * Tool builder — turns plugin manifests into MCP tool descriptors with ZERO
 * hardcoding. Every CLI command declared in a plugin manifest becomes a callable
 * MCP tool, gated by the authorization predicate (Permits) routed through the PDP.
 *
 * Two responsibilities, two functions:
 *   - createToolRegistry(): called ONCE at daemon startup; builds the entity
 *     registry whose snapshot is the source of available commands.
 *   - filterTools(): pure, cheap, per-request; projects a snapshot down to the
 *     tools the calling identity is permitted to use.
 */

import { createRegistry } from '@kb-labs/core-registry';
import { generateCommandSchema } from '@kb-labs/cli-commands';
import { getHandlerPermissions } from '@kb-labs/plugin-contracts';
import type { ICache } from '@kb-labs/core-platform';
import type {
  IEntityRegistry,
  RegistrySnapshot,
  RegistrySnapshotManifestEntry,
} from '@kb-labs/core-registry';
import type { CliCommandDecl, PermissionSpec } from '@kb-labs/plugin-contracts';
import type { CommandManifest } from '@kb-labs/cli-commands';
import type { Permits } from './authz.js';

/** A single plugin command exposed as an MCP tool, with everything needed to execute it. */
export interface McpTool {
  /** Namespaced, MCP-safe name: `${pluginId}__${command_path_with_underscores}`. */
  name: string;
  description: string;
  inputSchema: object;
  pluginId: string;
  pluginRoot: string;
  handlerPath: string;
  version: string;
  operationType: string | undefined;
  /** Handler permissions, propagated to executeCommandV3 for governance. */
  permissions: PermissionSpec;
}

/**
 * Build and initialize the entity registry. Called ONCE at daemon startup; the
 * returned registry's snapshot() feeds filterTools() on every request.
 */
export async function createToolRegistry(opts: {
  root: string;
  platformRoot?: string;
  cache: ICache;
}): Promise<IEntityRegistry> {
  return createRegistry({
    root: opts.root,
    platformRoot: opts.platformRoot,
    cache: { ttlMs: 60_000, adapter: opts.cache },
  });
}

/** MCP tool names must match `^[a-z0-9_-]+$` segments; collapse whitespace to underscores. */
function toolName(pluginId: string, commandPath: string): string {
  return `${pluginId}__${commandPath.trim().replace(/\s+/g, '_')}`;
}

/**
 * Adapt a manifest CLI command declaration into the CommandManifest shape that
 * generateCommandSchema consumes. Only the fields the schema generator reads are
 * meaningful here; loader is intentionally absent (schema generation never runs it).
 */
function toCommandManifest(
  decl: CliCommandDecl,
  entry: RegistrySnapshotManifestEntry,
): CommandManifest {
  const segments = decl.path.trim().split(/\s+/).filter(Boolean);
  return {
    manifestVersion: '1.0',
    segments,
    id: segments[segments.length - 1] ?? '',
    group: segments[0] ?? '',
    subgroup: segments.length >= 3 ? segments[1] : undefined,
    describe: decl.describe ?? '',
    longDescription: decl.longDescription,
    aliases: decl.aliases,
    category: decl.category,
    flags: decl.flags,
    examples: decl.examples,
    operationType: decl.operationType,
    package: entry.pluginId,
    manifestV2: entry.manifest,
    pkgRoot: entry.pluginRoot,
  };
}

/**
 * Project a registry snapshot down to the MCP tools the identity may use.
 * Pure and cheap — safe to call per request. Authorization is delegated entirely
 * to the supplied Permits predicate (PDP seam).
 */
export function filterTools(
  snapshot: Pick<RegistrySnapshot, 'manifests'>,
  permits: Permits,
): McpTool[] {
  const tools: McpTool[] = [];
  for (const entry of snapshot.manifests) {
    for (const decl of entry.manifest.cli?.commands ?? []) {
      if (!permits(decl.operationType, entry.pluginId)) {
        continue;
      }
      tools.push({
        name: toolName(entry.pluginId, decl.path),
        description: decl.describe,
        inputSchema: generateCommandSchema(toCommandManifest(decl, entry)),
        pluginId: entry.pluginId,
        pluginRoot: entry.pluginRoot,
        handlerPath: decl.handler,
        version: entry.manifest.version ?? '0.0.0',
        operationType: decl.operationType,
        permissions: getHandlerPermissions(entry.manifest, 'cli', decl.path),
      });
    }
  }
  return tools;
}
