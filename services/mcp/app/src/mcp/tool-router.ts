/**
 * Tool router — executes a resolved McpTool by routing through the same V3
 * command pipeline the CLI uses (executeCommandV3). Plugin output is captured
 * via a BufferedUI and returned as text for the MCP tool result.
 *
 * Multi-tenancy seam: callTool never touches a global platform directly. It
 * resolves the PlatformContainer through `resolvePlatform(tenantId)`. Today that
 * returns the single global container; when the platform gains per-tenant
 * isolation, only the resolver changes — this module stays untouched.
 */

import path from 'node:path';
import { executeCommandV3 } from '@kb-labs/cli-runtime';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import { createBufferedUI } from './ui.js';
import type { McpTool } from './tool-builder.js';

export interface ToolCallResult {
  success: boolean;
  output: string;
  exitCode: number;
}

/** Tenant → platform container. Default returns the global container; platform overrides for isolation. */
export type PlatformResolver = (tenantId: string) => PlatformContainer;

/**
 * Resolve a manifest handler reference (e.g. "dist/commands/x.js" or
 * "commands/x.js#handler") to an absolute path under the plugin's dist/.
 * Mirrors the CLI plugin-executor so MCP and CLI execution stay identical.
 */
function resolveHandlerPath(pluginRoot: string, handler: string): string {
  const relative = handler.split('#')[0] ?? handler;
  return relative.startsWith('dist/')
    ? path.resolve(pluginRoot, relative)
    : path.resolve(pluginRoot, 'dist', relative);
}

/** Project a PlatformContainer onto the PlatformServices surface executeCommandV3 consumes. */
function createPlatformServices(container: PlatformContainer): PlatformServices {
  return {
    logger: container.logger,
    llm: container.llm,
    embeddings: container.embeddings,
    vectorStore: container.vectorStore,
    cache: container.cache,
    config: container.config,
    storage: container.storage,
    analytics: container.analytics,
    eventBus: container.eventBus,
    invoke: container.invoke,
    sqlDatabase: container.sqlDatabase,
    documentDatabase: container.documentDatabase,
    logs: container.logs,
  };
}

/**
 * Execute an MCP tool. tenantId is propagated end-to-end (no loss); the platform
 * container is resolved through the seam so isolation is the platform's concern.
 */
export async function callTool(
  tool: McpTool,
  args: Record<string, unknown>,
  tenantId: string,
  resolvePlatform: PlatformResolver,
): Promise<ToolCallResult> {
  const { ui, getOutput } = createBufferedUI();
  const container = resolvePlatform(tenantId);

  const exitCode = await executeCommandV3({
    pluginId: tool.pluginId,
    pluginVersion: tool.version,
    pluginRoot: tool.pluginRoot,
    handlerPath: resolveHandlerPath(tool.pluginRoot, tool.handlerPath),
    argv: [],
    flags: args,
    tenantId,
    ui,
    platform: createPlatformServices(container),
    platformContainer: container,
    socketPath: container.getSocketPath(),
    permissions: tool.permissions,
    quotas: tool.permissions?.quotas,
  });

  return { success: exitCode === 0, output: getOutput(), exitCode };
}
