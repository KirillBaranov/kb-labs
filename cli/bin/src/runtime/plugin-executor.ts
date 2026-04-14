/**
 * Plugin Executor
 *
 * Executes plugin commands via the V3 execution pipeline.
 */

import type { SystemContext } from '@kb-labs/cli-runtime';
import { executeCommandV3 } from '@kb-labs/cli-runtime/v3';
import type { UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';
import { getHandlerPermissions, noopTraceContext, noopUI } from '@kb-labs/plugin-contracts';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import { setJsonMode } from '@kb-labs/shared-cli-ui';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RegisteredCommand } from '@kb-labs/cli-commands';
import type { PluginContextV3 } from '@kb-labs/plugin-contracts';
import { createCLIUIFacade } from './ui-facade';

export interface PluginExecutionOptions {
  context: SystemContext;
  commandId: string;
  argv: string[];
  flags: Record<string, unknown>;
  manifestCmd?: RegisteredCommand;
  platform: PlatformContainer;
}

/**
 * Execute a plugin command.
 *
 * Returns exitCode on success, undefined if the command could not be executed
 * (missing manifest, missing handlerPath, etc.).
 */
export async function executePlugin(
  options: PluginExecutionOptions
): Promise<number | undefined> {
  const { context, commandId, argv, flags, manifestCmd, platform } = options;

  // No manifest command info - can't execute
  if (!manifestCmd) {
    return undefined;
  }

  // Get plugin manifest (with fallback to legacy manifestV2 field)
  const pluginManifest = manifestCmd.v3Manifest ?? (manifestCmd.manifest as any).manifestV2;
  if (!pluginManifest) {
    return undefined;
  }

  // Find CLI command definition
  // commandId may be full path like "marketplace:plugins:list" — match by id, or by group:subgroup:id
  const cliCommand = pluginManifest.cli?.commands?.find((c: any) => {
    if (c.id === commandId) {return true;}
    // Match group:id or group:subgroup:id
    const parts = commandId.split(':');
    const bareId = parts[parts.length - 1];
    if (c.subgroup && parts.length === 3) {
      return c.group === parts[0] && c.subgroup === parts[1] && c.id === parts[2];
    }
    if (c.group && parts.length === 2) {
      // Match group:id — works with or without subgroup (2-part alias for subgroup commands)
      return c.group === parts[0] && c.id === parts[1];
    }
    return c.id === bareId;
  });

  // Resolve handler path (try handler first, fallback to handlerPath)
  const handlerRelativePath = cliCommand?.handlerPath ?? cliCommand?.handler?.split('#')[0];
  if (!handlerRelativePath) {
    return undefined;
  }

  const pluginRoot = manifestCmd.pkgRoot;
  if (!pluginRoot) {
    return undefined;
  }

  // Handler path should point to dist/ (compiled output)
  const handlerPath = handlerRelativePath.startsWith('dist/')
    ? path.resolve(pluginRoot, handlerRelativePath)
    : path.resolve(pluginRoot, 'dist', handlerRelativePath);

  try {
    const pluginId = pluginManifest.id || manifestCmd.manifest.id;
    const pluginVersion = pluginManifest.version || '0.0.0';

    // When --json is active, suppress all UI output except json() to keep stdout clean.
    const jsonMode = Boolean(flags.json);
    let ui = createCLIUIFacade((context as any).presenter);
    if (jsonMode) {
      setJsonMode(true);
      ui = createJsonModeUI(ui);
    }

    const platformServices = createPlatformServices(platform);
    const socketPath = platform.getSocketPath();
    const permissions = getHandlerPermissions(pluginManifest, 'cli', commandId);
    const quotas = permissions?.quotas;

    // Execute plugin. Pass the discovered `pkgRoot` explicitly so project-
    // scope plugins (whose node_modules live at
    // `<projectRoot>/.kb/plugins/<name>/node_modules/`, not under cwd) are
    // resolved correctly by the execution backend.
    try {
      const exitCode = await executeCommandV3({
        pluginId,
        pluginVersion,
        pluginRoot,
        handlerPath,
        argv,
        flags,
        ui,
        platform: platformServices,
        platformContainer: platform,
        socketPath,
        cwd: context.cwd || process.cwd(),
        devMode: process.env.NODE_ENV === 'development',
        permissions,
        quotas,
        configSection: pluginManifest.configSection,
      });

      context.logger?.debug('[plugin-executor] Command executed via platform.executionBackend', {
        pluginId,
        exitCode,
        hasBackend: !!platform.executionBackend,
      });

      return exitCode;
    } finally {
      if (jsonMode) {setJsonMode(false);}
    }

  } catch (error) {
    context.logger?.error('[plugin-executor] Plugin execution failed', undefined, {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Return a UIFacade that suppresses all output except json().
 * Used when --json flag is active to keep stdout clean for machine parsing.
 */
function createJsonModeUI(base: UIFacade): UIFacade {
  return {
    ...noopUI,
    colors: base.colors,
    symbols: base.symbols,
    json: base.json,
  };
}

/**
 * Create PlatformServices from platform container.
 */
function createPlatformServices(platformContainer: PlatformContainer): PlatformServices {
  return {
    logger: platformContainer.logger,
    llm: platformContainer.llm,
    embeddings: platformContainer.embeddings,
    vectorStore: platformContainer.vectorStore,
    cache: platformContainer.cache,
    config: platformContainer.config,
    storage: platformContainer.storage,
    analytics: platformContainer.analytics,
    eventBus: platformContainer.eventBus,
    invoke: platformContainer.invoke,
    sqlDatabase: platformContainer.sqlDatabase,
    documentDatabase: platformContainer.documentDatabase,
    logs: platformContainer.logs,
  };
}

/**
 * Create PluginContextV3 for system commands.
 *
 * Converts SystemContext → PluginContextV3.
 * Used by system commands (hello, version, etc.) to receive a full V3 context.
 */
export function createSystemCommandContext(
  context: SystemContext,
  platform: PlatformContainer
): PluginContextV3 {
  const ui = createCLIUIFacade((context as any).presenter);
  const requestId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const traceId = `trace-${randomUUID()}`;
  const spanId = `span-${randomUUID()}`;
  const invocationId = `inv-${randomUUID()}`;
  const executionId = `exec-${randomUUID()}`;

  const platformServices = createPlatformServices(platform);
  const scopedPlatformServices: PlatformServices = {
    ...platformServices,
    logger: platformServices.logger.child({
      layer: 'cli',
      requestId,
      reqId: requestId,
      traceId,
      spanId,
      invocationId,
      executionId,
      pluginId: '@kb-labs/system',
    }),
  };

  return {
    host: 'cli',
    requestId,
    pluginId: '@kb-labs/system',
    cwd: context.cwd || process.cwd(),
    ui,
    platform: scopedPlatformServices,
    runtime: {
      fs: {} as any,
      fetch: fetch as any,
      env: (key: string) => process.env[key],
    },
    api: {} as any,
    hostContext: { host: 'cli' as const, argv: process.argv.slice(2), flags: {} },
    pluginVersion: '1.0.0',
    trace: {
      ...noopTraceContext,
      traceId,
      spanId,
    },
  };
}
