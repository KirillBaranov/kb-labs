import type { Presenter } from "@kb-labs/cli-contracts";
import type { Output } from "@kb-labs/core-sys/output";
import { createContext, type SystemContext } from "../cli-context.js";
import type { ILogger } from "@kb-labs/core-platform";

export interface RuntimeContextOptions {
  presenter: Presenter;
  output: Output;
  logger?: ILogger;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  repoRoot?: string;
  config?: Record<string, any>;
}

export async function createRuntimeContext(
  options: RuntimeContextOptions,
): Promise<SystemContext> {
  return createContext({
    presenter: options.presenter,
    output: options.output,
    logger: options.logger,
    env: options.env,
    cwd: options.cwd,
    repoRoot: options.repoRoot,
    config: options.config,
  });
}
