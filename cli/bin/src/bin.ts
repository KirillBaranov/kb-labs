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

import { assertSupportedNode } from "./runtime/node-version.js";

// Fail before importing any platform module. Some dependencies require Node
// 24 built-ins (for example node:sqlite); without this guard users see an
// opaque module-loader stack instead of the supported-runtime instruction.
try {
  assertSupportedNode();
} catch (error) {
  process.stderr.write(`[kb] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const rawCliArgs = process.argv.slice(2);

function resolveBootstrapLogLevel(args: string[]): string | undefined {
  if (args.includes('--debug')) { return 'debug'; }
  const inline = args.find((arg) => arg.startsWith('--log-level='));
  if (inline) { return inline.slice('--log-level='.length); }
  const index = args.indexOf('--log-level');
  return index >= 0 ? args[index + 1] : undefined;
}

// CRITICAL: Set default log level BEFORE any imports to prevent log spam.
// ESM static imports execute before the module body and used to initialise
// PlatformContainer with the fallback logger at the default `info` level.
if (!process.env.LOG_LEVEL && !process.env.KB_LOG_LEVEL) {
  process.env.KB_LOG_LEVEL = resolveBootstrapLogLevel(rawCliArgs) ?? 'silent';
}

// CLI diagnostics belong on stderr. Command results and UI stay on stdout.
if (!process.env.KB_LOG_STREAM) {
  process.env.KB_LOG_STREAM = 'stderr';
}

// Check for --json flag BEFORE imports to ensure auto-init uses correct mode
// This prevents ConsoleSink from being created when user wants JSON output
if (process.argv.includes('--json')) {
  process.env.KB_OUTPUT_MODE = 'json';
}


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
  // Import the platform only after the logging environment is bootstrapped.
  const [{ run }, { platform }, { createCLIUIFacade }] = await Promise.all([
    import('./index.js'),
    import('@kb-labs/core-runtime'),
    import('./runtime/ui-facade.js'),
  ]);

  // Global handler — any uncaught exception renders as a formatted error box
  // instead of a raw Node.js stack dump.
  process.on('uncaughtException', (err) => {
    createCLIUIFacade().error(err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    createCLIUIFacade().error(err);
    process.exit(1);
  });

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
