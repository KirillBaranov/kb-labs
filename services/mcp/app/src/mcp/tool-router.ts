/**
 * Tool router — executes a resolved McpTool by routing through the same V3
 * command pipeline the CLI uses (executeCommandV3). Plugin output is captured
 * via two complementary mechanisms and returned as text for the MCP tool result:
 *
 *   1. UIFacade (primary): plugins that call ui.info/success/warn/error/write.
 *   2. stdout intercept (fallback): plugins that bypass the facade and call
 *      console.log / process.stdout.write directly (e.g. ANSI spinner lines).
 *      Both are merged in the order they arrive, giving callers the full picture.
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
    documentDatabase: container.documentDatabase,
    kvStore: container.kvStore,
    logs: container.logs,
  };
}

/**
 * Intercept process.stdout and console.* for the duration of fn(), appending
 * all raw output to push(). Restores originals in a finally block so a thrown
 * error can never leave stdout permanently redirected.
 *
 * Strips ANSI escape sequences so MCP clients receive clean plain text.
 */
function withStdoutCapture(push: (s: string) => void, fn: () => Promise<number>): Promise<number> {
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (s: string): string => s.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1B[()][AB012]/g, '');

  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog   = console.log;
  const origInfo  = console.info;
  const origWarn  = console.warn;
  const origError = console.error;

  const capture = (chunk: unknown): void => {
    const text = typeof chunk === 'string' ? chunk : String(chunk ?? '');
    const clean = stripAnsi(text).trim();
    if (clean) push(clean);
  };

  // Override stdout.write (covers process.stdout.write calls).
  process.stdout.write = (chunk: unknown, ...rest: unknown[]): boolean => {
    capture(chunk);
    return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
  };

  // Override console.* (covers direct console.log calls from plugins).
  console.log   = (...a) => { capture(a.join(' ')); origLog(...a);   };
  console.info  = (...a) => { capture(a.join(' ')); origInfo(...a);  };
  console.warn  = (...a) => { capture(a.join(' ')); origWarn(...a);  };
  console.error = (...a) => { capture(a.join(' ')); origError(...a); };

  return fn().finally(() => {
    process.stdout.write = origWrite;
    console.log   = origLog;
    console.info  = origInfo;
    console.warn  = origWarn;
    console.error = origError;
  });
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
  const stdoutLines: string[] = [];
  const container = resolvePlatform(tenantId);

  const exitCode = await withStdoutCapture(
    (line) => stdoutLines.push(line),
    () => executeCommandV3({
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
    }),
  );

  // Merge: UIFacade output first (structured), then any direct stdout lines
  // that weren't already captured through the facade.
  const facadeOutput = getOutput();
  const combined = [facadeOutput, ...stdoutLines].filter(Boolean).join('\n');

  return { success: exitCode === 0, output: combined, exitCode };
}
