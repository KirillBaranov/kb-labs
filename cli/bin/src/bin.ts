/**
 * bin.ts — CLI entry point for the `kb` command.
 *
 * This is the first module executed when the CLI binary is invoked. It is
 * responsible for environment bootstrapping that must happen before any other
 * modules are imported:
 *
 *  1. Log level    — defaults KB_LOG_LEVEL to "silent" so that no log output
 *                    leaks unless the user passes --debug or sets LOG_LEVEL /
 *                    KB_LOG_LEVEL explicitly.
 *  2. Output mode  — sets KB_OUTPUT_MODE to "json" when --json is present so
 *                    that lazily-initialised sinks (e.g. ConsoleSink) are never
 *                    created when machine-readable JSON output is requested.
 *
 * After bootstrapping, it imports and calls `run()` from the CLI index with
 * the raw process arguments (argv[2..]), then ensures the platform is
 * gracefully shut down via `platform.shutdown()` before the process exits.
 * If `run()` returns a numeric exit code, that code is forwarded to
 * `process.exit()` so the shell receives the correct status.
 */

// CRITICAL: Set default log level BEFORE any imports to prevent log spam
// This must happen before auto-init in lazy-loaded loggers
if (!process.env.LOG_LEVEL && !process.env.KB_LOG_LEVEL) {
  // Default to 'silent' to show NO logs without --debug flag
  // User can override with --debug flag or LOG_LEVEL/KB_LOG_LEVEL env var
  process.env.KB_LOG_LEVEL = 'silent';
}

// Check for --json flag BEFORE imports to ensure auto-init uses correct mode
// This prevents ConsoleSink from being created when user wants JSON output
if (process.argv.includes('--json')) {
  process.env.KB_OUTPUT_MODE = 'json';
}


import { run } from "./index";
import { platform } from "@kb-labs/core-runtime";
import { createRequire } from "module";

// Captured at module load so that `resolvePlatformRoot` can walk up from the
// physical location of this bin.js file — the most reliable way to locate
// `node_modules/@kb-labs/*` in installed mode (independent of process.cwd()).
const BIN_MODULE_URL = import.meta.url;

// Inject CLI_VERSION from package.json so system commands (version, health, diag)
// can report the correct version at runtime without hardcoding it at build time.
// package.json sits one level above dist/bin.js in both dev and installed mode.
if (!process.env.CLI_VERSION) {
  try {
    const _req = createRequire(import.meta.url);
    const pkg = _req('../package.json') as { version?: string };
    if (pkg.version) {
      process.env.CLI_VERSION = pkg.version;
    }
  } catch {
    // Non-fatal: version command will fall back to '0.0.0'
  }
}

(async () => {
  let code: number | void;
  try {
    code = await run(process.argv.slice(2), { moduleUrl: BIN_MODULE_URL });
  } finally {
    try {
      await platform.shutdown();
    } catch (error) {
      process.stderr.write(
        `[kb] platform shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }

  if (typeof code === "number") {
    process.exit(code);
  }
})();
