/**
 * Platform initialization for KB Labs CLI.
 *
 * Thin wrapper around `loadPlatformConfig` + `initPlatform` from
 * `@kb-labs/core-runtime`. The shared loader is responsible for resolving
 * `platformRoot` and `projectRoot`, loading the `.env` file, reading both
 * platform defaults and project config, and deep-merging them. This file
 * only adds CLI-specific concerns: the UI provider, lifecycle hooks, and
 * NoOp fallback on failure.
 */

import { createHash } from "node:crypto";
import {
  initPlatform,
  loadPlatformConfig,
  platform,
  type PlatformConfig,
  type PlatformContainer,
  type PlatformLifecycleContext,
  type PlatformLifecycleHooks,
  type PlatformLifecyclePhase,
} from "@kb-labs/core-runtime";
import { findRepoRoot } from "@kb-labs/core-sys";
import { makeAssemblyHook } from "@kb-labs/plugin-runtime";
import { noopUI } from "@kb-labs/plugin-contracts";
import type { UIFacade } from "@kb-labs/plugin-contracts";
import { createCLIUIFacade } from "./ui-facade";
import { createContextLogger } from "@kb-labs/core-platform";

const CLI_LIFECYCLE_HOOK_ID = "cli-runtime";
const LOG_SERVICE = "platform-init";
let lifecycleHooksRegistered = false;

function lifecycleLogger() {
  return createContextLogger(platform.logger, {
    applicationId: "kb",
    serviceId: "kb",
    instanceId: `${process.pid}`,
    layer: "cli",
  }).forComponent("platform-lifecycle");
}

function ensureLifecycleHooksRegistered(): void {
  if (lifecycleHooksRegistered) {
    return;
  }

  const hooks: PlatformLifecycleHooks = {
    onStart: (ctx: PlatformLifecycleContext) => {
      lifecycleLogger().debug("Platform lifecycle: start", {
        app: "cli",
        cwd: ctx.cwd,
        isChildProcess: ctx.isChildProcess,
      });
    },
    onReady: (ctx: PlatformLifecycleContext) => {
      lifecycleLogger().debug("Platform lifecycle: ready", {
        app: "cli",
        durationMs: ctx.metadata?.durationMs,
      });
    },
    onShutdown: () => {
      lifecycleLogger().debug("Platform lifecycle: shutdown", { app: "cli" });
    },
    onError: (error: unknown, phase: PlatformLifecyclePhase) => {
      lifecycleLogger().warn("Platform lifecycle hook error", {
        app: "cli",
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };

  platform.registerLifecycleHooks(CLI_LIFECYCLE_HOOK_ID, hooks);
  lifecycleHooksRegistered = true;
}

/**
 * Create CLI-specific UI provider.
 * Returns rich UI for CLI host, noopUI for other hosts (REST, workflow, etc.)
 */
function createCLIUIProvider(): (hostType: string) => UIFacade {
  return (hostType: string): UIFacade => {
    if (hostType !== "cli") {
      return noopUI;
    }
    return createCLIUIFacade();
  };
}

export interface PlatformInitResult {
  /** The initialized platform singleton. */
  platform: PlatformContainer;
  /** The merged effective platform config. */
  platformConfig: PlatformConfig;
  /** Full raw project config (for `useConfig()` access). */
  rawConfig?: Record<string, unknown>;
  /** Raw config with `.kb/overlays/` applied — what `useConfig()` should read. */
  effectiveConfig?: Record<string, unknown>;
  /** Where the KB Labs platform code lives (node_modules/@kb-labs/*). */
  platformRoot: string;
  /** Where the user's `.kb/kb.config.json` lives. */
  projectRoot: string;
}

/**
 * Initialize the platform for the CLI process.
 *
 * @param cwd        Starting directory for project-root discovery
 *                   (typically `process.cwd()`).
 * @param moduleUrl  `import.meta.url` of the CLI binary — lets us locate
 *                   the platform installation in installed mode without
 *                   guessing `..` levels. Optional in dev mode.
 */
export async function initializePlatform(
  cwd: string,
  moduleUrl?: string,
): Promise<PlatformInitResult> {
  ensureLifecycleHooksRegistered();

  // Mirror daemon.ts: derive KB_SOCKET_HASH before config is loaded so
  // ${KB_SOCKET_HASH} placeholders in socket paths resolve without warnings.
  // kb-dev sets it as a real env var for managed services; the CLI derives the
  // same value from KB_PROJECT_ROOT (or the repo root) when running standalone.
  if (!process.env["KB_SOCKET_HASH"]) {
    const repoRoot = await findRepoRoot(cwd).catch(() => cwd);
    const hashRoot = process.env["KB_PROJECT_ROOT"] ?? repoRoot;
    process.env["KB_SOCKET_HASH"] = createHash("md5")
      .update(hashRoot)
      .digest("hex")
      .slice(0, 8);
  }

  const uiProvider = createCLIUIProvider();

  // Load config outside of the adapter-init try/catch so rawConfig survives
  // even when initPlatform fails (e.g. Redis/Qdrant not running in dev).
  let loadResult: Awaited<ReturnType<typeof loadPlatformConfig>> | undefined;
  try {
    loadResult = await loadPlatformConfig({
      moduleUrl,
      startDir: cwd,
    });
  } catch {
    // Config file missing or unreadable — proceed with full fallback below.
  }

  if (loadResult) {
    const {
      platformConfig,
      rawConfig,
      effectiveConfig,
      platformRoot,
      projectRoot,
      sources,
    } = loadResult;
    try {
      // Relative adapter paths (e.g. ".kb/database/kb.sqlite") must resolve
      // against the project root — this is where the user's .kb/ lives.
      // Pass platformRoot so initPlatform finds marketplace.lock in the
      // right place when platform is installed separately from the project.
      const platformInstance = await initPlatform(
        platformConfig,
        projectRoot,
        uiProvider,
        platformRoot !== projectRoot ? platformRoot : undefined,
        makeAssemblyHook(() =>
          process.env.KB_DEBUG === "true" ? platform.logger : undefined,
        ),
      );

      platformInstance.logger.info("Platform adapters initialized", {
        layer: "cli",
        service: LOG_SERVICE,
        platformRoot,
        projectRoot,
        sources,
        adapters: Object.keys(platformConfig.adapters ?? {}),
        hasAdapterOptions: !!platformConfig.adapterOptions,
      });

      if (process.env.KB_DEBUG === "true") {
        platformInstance.logger.debug("kb.diag.config", {
          event: "kb.diag.config",
          v: 1,
          data: {
            platformConfigPath: sources.platformDefaults,
            projectConfigPath: sources.projectConfig,
            overlayPaths: sources.overlays ?? [],
            fieldSources: sources.fields ?? {},
            ignoredProjectFields: sources.ignoredProjectFields ?? [],
          },
          ts: Date.now(),
        });
      }

      return {
        platform: platformInstance,
        platformConfig,
        rawConfig,
        effectiveConfig,
        platformRoot,
        projectRoot,
      };
    } catch (error) {
      // Adapters failed to connect (Redis/Qdrant/MongoDB not running in dev).
      // Fall back to NoOp adapters but preserve rawConfig so useConfig() works.
      const fallbackConfig: PlatformConfig = { adapters: {} };
      const platformInstance = await initPlatform(
        fallbackConfig,
        projectRoot,
        uiProvider,
        undefined,
        makeAssemblyHook(() =>
          process.env.KB_DEBUG === "true" ? platform.logger : undefined,
        ),
      );
      platformInstance.logger.warn(
        "Platform adapters failed, using NoOp adapters",
        {
          layer: "cli",
          service: LOG_SERVICE,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {
        platform: platformInstance,
        platformConfig: fallbackConfig,
        rawConfig,
        effectiveConfig,
        platformRoot,
        projectRoot,
      };
    }
  }

  // Full fallback: config could not be loaded at all.
  const fallbackConfig: PlatformConfig = { adapters: {} };
  const platformInstance = await initPlatform(
    fallbackConfig,
    cwd,
    uiProvider,
    undefined,
    makeAssemblyHook(() =>
      process.env.KB_DEBUG === "true" ? platform.logger : undefined,
    ),
  );
  platformInstance.logger.warn(
    "Platform initialization failed, using NoOp adapters",
    { layer: "cli", service: LOG_SERVICE },
  );
  return {
    platform: platformInstance,
    platformConfig: fallbackConfig,
    platformRoot: cwd,
    projectRoot: cwd,
  };
}
