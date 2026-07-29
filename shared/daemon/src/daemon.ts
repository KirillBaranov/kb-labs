import {
  launchPlatform,
  type PlatformAssemblyHook,
  type PlatformContainer,
  type PlatformFailurePolicy,
  type PlatformRuntime,
  type PlatformUiProvider,
} from "@kb-labs/core-runtime";
import type { IContextLogger, IServiceTransport } from "@kb-labs/core-platform";

export interface ServiceContext {
  platform: PlatformContainer;
  logger: IContextLogger;
  port: number;
  host: string;
  runtime: PlatformRuntime;
  platformRoot: string;
  projectRoot: string;
}

interface NetworkServiceConfig {
  appId: string;
  /**
   * serviceId in the declarative transport map. Defaults to appId.
   * Edge services that are not in the map use defaultPort + KB_NET_OFFSET.
   */
  serviceId?: string;
  defaultPort: number;
  portEnvVar: string;
  defaultHost?: string;
  hostEnvVar?: string;
}

export interface ServiceConfig extends NetworkServiceConfig {
  /** Starting directory for project/platform root resolution. */
  startDir?: string;
  /** Entrypoint import.meta.url for installed-mode platform discovery. */
  moduleUrl?: string;
  platform: {
    assemblyHook: PlatformAssemblyHook;
    failurePolicy?: PlatformFailurePolicy;
    loadEnv?: boolean;
    storeRawConfig?: boolean;
    uiProvider?: PlatformUiProvider;
  };
  /**
   * Runs after the platform is ready. The returned teardown is always called
   * before PlatformRuntime.shutdown().
   */
  setup(ctx: ServiceContext): Promise<() => Promise<void>>;
}

interface ManagedRuntime {
  platform: PlatformContainer;
  logger: IContextLogger;
  projectRoot: string;
  platformRoot: string;
  shutdown(reason?: string): Promise<void>;
  runtime: PlatformRuntime;
}

function resolveNetwork(
  config: NetworkServiceConfig,
  platform: PlatformContainer,
): { port: number; host: string } {
  const serviceId = config.serviceId ?? config.appId;
  const transport = platform.getAdapter<IServiceTransport>("serviceTransport");
  const address = transport?.listenAddress?.(serviceId);
  const netOffset = Number(process.env.KB_NET_OFFSET) || 0;

  const port =
    address && "port" in address
      ? address.port
      : (process.env[config.portEnvVar]
          ? parseInt(process.env[config.portEnvVar]!, 10)
          : config.defaultPort) + netOffset;

  const transportHost = address && "host" in address ? address.host : undefined;
  const host =
    config.hostEnvVar && process.env[config.hostEnvVar]
      ? process.env[config.hostEnvVar]!
      : (transportHost ?? config.defaultHost ?? "0.0.0.0");

  return { port, host };
}

async function runManagedService(
  config: NetworkServiceConfig,
  managed: ManagedRuntime,
  setup: (context: ServiceContext) => Promise<() => Promise<void>>,
): Promise<void> {
  const { port, host } = resolveNetwork(config, managed.platform);
  const logger = managed.logger.forComponent("service-bootstrap");

  logger.event("info", {
    event: "service.starting",
    message: "Service starting",
    fields: { port, host },
  });

  let teardown: (() => Promise<void>) | undefined;
  try {
    teardown = await setup({
      runtime: managed.runtime as PlatformRuntime,
      platform: managed.platform,
      logger,
      port,
      host,
      projectRoot: managed.projectRoot,
      platformRoot: managed.platformRoot,
    });
  } catch (error) {
    logger.error(
      "Service setup failed",
      error instanceof Error ? error : undefined,
      {
        event: "service.failed",
        error: error instanceof Error ? error.message : String(error),
      },
    );
    await managed.shutdown("service.setup-failed");
    throw error;
  }

  logger.event("info", {
    event: "service.ready",
    message: "Service ready",
    fields: { port, host, outcome: "success" },
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: string): Promise<void> => {
    shutdownPromise ??= (async () => {
      logger.event("info", {
        event: "service.stopping",
        message: "Service stopping",
        fields: { signal },
      });
      let shutdownError: unknown;

      try {
        await teardown?.();
      } catch (error) {
        shutdownError = error;
        logger.error(
          "Service teardown failed",
          error instanceof Error ? error : undefined,
          {
            event: "service.failed",
            phase: "teardown",
          },
        );
      }

      try {
        await managed.shutdown(`signal:${signal}`);
      } catch (error) {
        shutdownError ??= error;
        logger.error(
          "Platform shutdown failed",
          error instanceof Error ? error : undefined,
          {
            event: "service.failed",
            phase: "platform-shutdown",
          },
        );
      }

      const exitCode = shutdownError ? 1 : 0;
      logger.event(shutdownError ? "error" : "info", {
        event: shutdownError ? "service.failed" : "service.stopped",
        message: shutdownError
          ? "Service stopped with errors"
          : "Service stopped",
        fields: {
          signal,
          exitCode,
          outcome: shutdownError ? "failure" : "success",
        },
      });
      process.exit(exitCode);
    })();
    return shutdownPromise;
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Canonical service process launcher.
 *
 * Every service gets the same roots/env/config/platform lifecycle. Service code
 * starts only inside setup(), after PlatformRuntime is ready.
 */
export async function runService(config: ServiceConfig): Promise<void> {
  const runtime = await launchPlatform({
    applicationId: config.appId,
    serviceId: config.serviceId ?? config.appId,
    kind: "service",
    startDir: config.startDir,
    moduleUrl: config.moduleUrl,
    assemblyHook: config.platform.assemblyHook,
    failurePolicy: config.platform.failurePolicy,
    loadEnv: config.platform.loadEnv,
    storeRawConfig: config.platform.storeRawConfig,
    uiProvider: config.platform.uiProvider,
  });

  await runManagedService(
    config,
    {
      runtime,
      platform: runtime.platform,
      logger: runtime.logger,
      projectRoot: runtime.roots.projectRoot,
      platformRoot: runtime.roots.platformRoot,
      shutdown: (reason) => runtime.shutdown(reason),
    },
    config.setup,
  );
}
