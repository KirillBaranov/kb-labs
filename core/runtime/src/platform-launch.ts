/**
 * @module @kb-labs/core-runtime/platform-launch
 *
 * Canonical platform launch path shared by services, CLI hosts and workers.
 *
 * This module owns platform concerns only:
 * - layered config and environment loading;
 * - adapter initialisation and assembly;
 * - application-scoped logging context;
 * - startup diagnostics and idempotent platform shutdown.
 *
 * Process concerns such as OS signals, exit codes and service-specific teardown
 * deliberately belong to the caller (for example @kb-labs/shared-daemon).
 */

import type { ILogger, ILogReader } from "@kb-labs/core-platform";
import { getAdapterStatus, type AdapterSlotStatus } from "./adapter-status.js";
import {
  platform,
  type PlatformContainer,
  type PlatformLifecycleContext,
  type PlatformLifecycleHooks,
  type PlatformLifecyclePhase,
} from "./container.js";
import type { PlatformConfig } from "./config.js";
import {
  loadPlatformConfig,
  type LoadPlatformConfigResult,
} from "./config-loader.js";
import { initPlatform, resetPlatform } from "./loader.js";

export type PlatformApplicationKind = "service" | "cli" | "worker" | "test";
export type PlatformFailurePolicy = "strict" | "degraded";

export type PlatformAssemblyHook = NonNullable<
  Parameters<typeof initPlatform>[4]
>;
export type PlatformUiProvider = NonNullable<
  Parameters<typeof initPlatform>[2]
>;

export interface PlatformLaunchOptions {
  /** Stable identity used for lifecycle and root logger bindings. */
  applicationId: string;
  /** Runtime surface. It affects policy, never the ILogger contract. */
  kind: PlatformApplicationKind;
  /** Directory used to resolve project and platform roots. */
  startDir?: string;
  /** Entrypoint import.meta.url, useful in installed mode. */
  moduleUrl?: string;
  /** Load layered .env files before config interpolation. @default true */
  loadEnv?: boolean;
  /** Publish raw/effective config through the compatibility globals. @default true */
  storeRawConfig?: boolean;
  /** Behaviour when configured platform initialisation fails. @default strict */
  failurePolicy?: PlatformFailurePolicy;
  /** Host-specific UI provider used by execution backends. */
  uiProvider?: PlatformUiProvider;
  /** Required platform assembly pipeline. */
  assemblyHook: PlatformAssemblyHook;
}

export interface PlatformRoots {
  platformRoot: string;
  projectRoot: string;
  sameLocation: boolean;
}

export interface PlatformStartupReport {
  applicationId: string;
  kind: PlatformApplicationKind;
  status: "ready" | "degraded";
  durationMs: number;
  configFound: boolean;
  sources: LoadPlatformConfigResult["sources"];
  adapters: AdapterSlotStatus[];
  error?: string;
}

export interface PlatformRuntime {
  application: {
    id: string;
    kind: PlatformApplicationKind;
  };
  platform: PlatformContainer;
  logger: ILogger;
  /** Read side of the platform log system for diagnostics and tooling. */
  readonly logs: ILogReader;
  platformConfig: PlatformConfig;
  rawConfig?: Record<string, unknown>;
  effectiveConfig?: Record<string, unknown>;
  roots: PlatformRoots;
  startupReport: PlatformStartupReport;
  shutdown(reason?: string): Promise<void>;
}

let activeRuntime: PlatformRuntime | undefined;
let activeLaunch: Promise<PlatformRuntime> | undefined;

function registerLifecycleLogging(
  applicationId: string,
  kind: PlatformApplicationKind,
): void {
  const hookId = `platform-launch:${applicationId}`;
  if (platform.listLifecycleHookIds().includes(hookId)) {
    return;
  }

  const lifecycleLogger = () =>
    platform.logger.child({
      applicationId,
      serviceId: applicationId,
      layer: kind,
      component: "platform-lifecycle",
    });

  const hooks: PlatformLifecycleHooks = {
    onStart(context: PlatformLifecycleContext) {
      lifecycleLogger().debug("Platform lifecycle start", {
        cwd: context.cwd,
        isChildProcess: context.isChildProcess,
      });
    },
    onReady(context: PlatformLifecycleContext) {
      lifecycleLogger().info("Platform lifecycle ready", {
        durationMs: context.metadata?.durationMs,
      });
    },
    onBeforeShutdown(context: PlatformLifecycleContext) {
      lifecycleLogger().debug("Platform lifecycle before shutdown", {
        reason: context.reason,
      });
    },
    onShutdown(context: PlatformLifecycleContext) {
      lifecycleLogger().info("Platform lifecycle shutdown", {
        reason: context.reason,
      });
    },
    onError(error: unknown, phase: PlatformLifecyclePhase) {
      lifecycleLogger().error(
        "Platform lifecycle failed",
        error instanceof Error ? error : undefined,
        {
          phase,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    },
  };

  platform.registerLifecycleHooks(hookId, hooks);
}

function publishConfigGlobals(
  loadResult: LoadPlatformConfigResult,
  storeRawConfig: boolean,
): void {
  if (!storeRawConfig) {
    return;
  }

  const target = globalThis as Record<string, unknown>;
  target.__KB_PLATFORM_CONFIG__ = loadResult.platformConfig;
  target.__KB_RAW_CONFIG__ = loadResult.rawConfig;
  target.__KB_EFFECTIVE_CONFIG__ =
    loadResult.effectiveConfig ?? loadResult.rawConfig;
}

async function launch(
  options: PlatformLaunchOptions,
): Promise<PlatformRuntime> {
  const {
    applicationId,
    kind,
    startDir = process.cwd(),
    moduleUrl,
    loadEnv = true,
    storeRawConfig = true,
    failurePolicy = "strict",
    uiProvider,
    assemblyHook,
  } = options;

  const startedAt = Date.now();
  registerLifecycleLogging(applicationId, kind);

  const loadResult = await loadPlatformConfig({
    moduleUrl,
    startDir,
    loadEnvFile: loadEnv,
  });
  publishConfigGlobals(loadResult, storeRawConfig);

  const {
    platformConfig,
    rawConfig,
    effectiveConfig,
    platformRoot,
    projectRoot,
    sameLocation,
    sources,
  } = loadResult;

  let effectivePlatformConfig = platformConfig;
  let status: PlatformStartupReport["status"] = "ready";
  let startupError: string | undefined;

  try {
    await initPlatform(
      platformConfig,
      projectRoot,
      uiProvider,
      sameLocation ? undefined : platformRoot,
      assemblyHook,
    );
  } catch (error) {
    if (failurePolicy === "strict") {
      throw error;
    }

    status = "degraded";
    startupError = error instanceof Error ? error.message : String(error);
    effectivePlatformConfig = { adapters: {} };
    await initPlatform(
      effectivePlatformConfig,
      projectRoot,
      uiProvider,
      undefined,
      assemblyHook,
    );
  }

  const logger = platform.logger.child({
    applicationId,
    serviceId: applicationId,
    layer: kind,
  });
  const configFound = Boolean(
    sources.platformDefaults || sources.projectConfig,
  );
  const startupReport: PlatformStartupReport = {
    applicationId,
    kind,
    status,
    durationMs: Date.now() - startedAt,
    configFound,
    sources,
    adapters: getAdapterStatus(),
    ...(startupError ? { error: startupError } : {}),
  };

  if (status === "degraded") {
    logger.warn("Platform launched in degraded mode", {
      error: startupError,
      platformRoot,
      projectRoot,
    });
  } else {
    logger.info("Platform launched", {
      platformRoot,
      projectRoot,
      configFound,
      durationMs: startupReport.durationMs,
    });
  }

  let shutdownPromise: Promise<void> | undefined;
  const runtime: PlatformRuntime = {
    application: { id: applicationId, kind },
    platform,
    logger,
    get logs() {
      return platform.logs;
    },
    platformConfig: effectivePlatformConfig,
    rawConfig,
    effectiveConfig,
    roots: {
      platformRoot,
      projectRoot,
      sameLocation,
    },
    startupReport,
    shutdown(reason = "platform-runtime.shutdown") {
      shutdownPromise ??= platform.shutdown().finally(() => {
        logger.debug("Platform runtime stopped", { reason });
      });
      return shutdownPromise;
    },
  };

  return runtime;
}

/**
 * Launch the process-wide platform runtime.
 *
 * Calls are idempotent for the same application. Launching a second
 * application identity in one process is rejected because PlatformContainer is
 * intentionally process-scoped.
 */
export async function launchPlatform(
  options: PlatformLaunchOptions,
): Promise<PlatformRuntime> {
  if (activeRuntime) {
    if (
      activeRuntime.application.id !== options.applicationId ||
      activeRuntime.application.kind !== options.kind
    ) {
      throw new Error(
        `Platform is already launched for "${activeRuntime.application.id}" ` +
          `(${activeRuntime.application.kind}); cannot relaunch it for ` +
          `"${options.applicationId}" (${options.kind}) in the same process.`,
      );
    }
    return activeRuntime;
  }

  activeLaunch ??= launch(options)
    .then((runtime) => {
      activeRuntime = runtime;
      return runtime;
    })
    .catch((error) => {
      activeLaunch = undefined;
      throw error;
    });

  return activeLaunch;
}

/** Return the active runtime, if launchPlatform() has completed. */
export function getPlatformRuntime(): PlatformRuntime | undefined {
  return activeRuntime;
}

/** Test-only reset for the launch state and process-wide platform singleton. */
export function resetPlatformRuntime(): void {
  activeRuntime = undefined;
  activeLaunch = undefined;
  resetPlatform();
}
