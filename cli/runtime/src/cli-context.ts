// System command context - NOT a plugin context
// System commands don't need V3 plugin overhead (permissions, sandbox, etc.)

import type { Presenter } from "@kb-labs/cli-contracts";
import type { Output } from "@kb-labs/core-sys/output";
import type { ILogger } from "@kb-labs/core-platform";
import { createId } from "@kb-labs/plugin-runtime";
import path from "node:path";
import { existsSync } from "node:fs";

function detectRepoRoot(start: string): string {
  let cur = path.resolve(start);
  while (true) {
    if (existsSync(path.join(cur, ".git"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      return start;
    }
    cur = parent;
  }
}

/**
 * Full CLI runtime context.
 *
 * Structurally compatible with cli-contracts' SystemContext (which is the
 * minimal contract for command handlers) but includes runtime-specific fields:
 * requestId, presenter, logger, verbosity, jsonMode.
 *
 * The Output type here is the full Output from core-sys (with progress,
 * spinner, json, etc.), not the simple one from cli-contracts.
 */
export interface SystemContext {
  /** Request ID for tracing */
  requestId: string;
  /** Current working directory */
  cwd: string;
  /** Repository root */
  repoRoot: string;
  /** Environment variables */
  env: NodeJS.ProcessEnv;
  /** Output presenter */
  presenter: Presenter;
  /** Logger */
  logger?: ILogger;
  /** Output adapter (full core-sys Output) */
  output: Output;
  /** Configuration */
  config?: Record<string, any>;
  /** Profile ID */
  profileId?: string;
  /** Verbosity level */
  verbosity: "quiet" | "normal" | "verbose";
  /** JSON output mode */
  jsonMode: boolean;
}

export interface CreateContextOptions {
  presenter: Presenter;
  logger?: ILogger;
  output: Output;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  repoRoot?: string;
  config?: Record<string, any>;
  profileId?: string;
  verbosity?: "quiet" | "normal" | "verbose";
  jsonMode?: boolean;
}

/**
 * Create SystemContext for built-in CLI commands
 *
 * System commands (kb plugins list, kb workflow run, etc.) don't need
 * the full V3 plugin context with permissions/sandbox/platform services.
 * This creates a simple, lightweight context.
 */
export async function createContext({
  presenter,
  logger,
  output,
  env,
  cwd,
  repoRoot,
  config = {},
  profileId,
  verbosity = "normal",
  jsonMode = false,
}: CreateContextOptions): Promise<SystemContext> {
  const resolvedEnv = env ?? process.env;
  const resolvedCwd = cwd ?? process.cwd();
  const resolvedRepoRoot = repoRoot ?? detectRepoRoot(resolvedCwd);

  return {
    requestId: createId(),
    cwd: resolvedCwd,
    repoRoot: resolvedRepoRoot,
    env: resolvedEnv,
    presenter,
    logger,
    output,
    config,
    profileId,
    verbosity,
    jsonMode,
  };
}
