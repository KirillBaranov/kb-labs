/**
 * Compatibility facade for service packages built against the legacy
 * createServiceBootstrap API.
 *
 * New services should use launchPlatform/runService. Keeping this facade lets
 * an installed platform start older service packages while the platform is
 * upgraded one package at a time.
 */

import { platform } from "./container.js";
import {
  launchPlatform,
  getPlatformRuntime,
  resetPlatformRuntime,
  type PlatformAssemblyHook,
  type PlatformUiProvider,
} from "./platform-launch.js";
import { loadEnvFromDirectory } from "./config-loader.js";

export interface ServiceBootstrapOptions {
  appId: string;
  repoRoot: string;
  storeRawConfig?: boolean;
  loadEnv?: boolean;
  uiProvider?: PlatformUiProvider;
  assemblyHook: PlatformAssemblyHook;
}

export async function createServiceBootstrap(
  options: ServiceBootstrapOptions,
): Promise<typeof platform> {
  await launchPlatform({
    applicationId: options.appId,
    kind: "service",
    startDir: options.repoRoot,
    loadEnv: options.loadEnv,
    storeRawConfig: options.storeRawConfig,
    uiProvider: options.uiProvider,
    assemblyHook: options.assemblyHook,
  });
  return platform;
}

export function getPlatformRoot(): string | undefined {
  return launchPlatformRoots()?.platformRoot;
}

export function getProjectRoot(): string | undefined {
  return launchPlatformRoots()?.projectRoot;
}

function launchPlatformRoots():
  | { platformRoot: string; projectRoot: string }
  | undefined {
  return getPlatformRuntime()?.roots;
}

export function resetServiceBootstrap(): void {
  resetPlatformRuntime();
}

export function loadEnvFromRoot(repoRoot: string): void {
  loadEnvFromDirectory(repoRoot);
}
