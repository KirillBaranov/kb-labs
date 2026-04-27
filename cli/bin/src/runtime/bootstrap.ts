import {
  createJsonPresenter,
  createTextPresenter,
  createContext,
  parseArgs,
  CliError,
  mapCliErrorToExitCode,
  colors,
  type ExecutionLimits,
} from "@kb-labs/cli-runtime";
import {
  findCommand,
  findCommandWithType,
  registerBuiltinCommands,
  renderGlobalHelpNew,
  renderGroupHelp,
  renderManifestCommandHelp,
  renderProductHelp,
  registry,
  type RegisteredCommand,
} from "@kb-labs/cli-commands";
import type { Presenter } from "@kb-labs/cli-runtime";
import { createOutput } from "@kb-labs/core-sys/output";
import {
  createCliRuntime,
  type RuntimeSetupOptions,
  type MiddlewareConfig,
  type OutputFormatter,
} from "@kb-labs/cli-runtime";
import { handleLimitFlag } from "./limits";
import { getDefaultMiddlewares } from "./middlewares";
import { executePlugin, createSystemCommandContext } from "./plugin-executor";
import { tryResolveGateway, executeViaGateway } from "./gateway-executor";
import { loadEnvFile } from "./env-loader";
import { initializePlatform } from "./platform-init";
import { resolveVersion } from "./helpers/version";
import { normalizeCmdPath } from "./helpers/cmd-path";
import { shouldShowLimits } from "./helpers/flags";
import type { PlatformContainer, PlatformConfig } from "@kb-labs/core-runtime";

declare global {
  // eslint-disable-next-line no-var
  var __KB_PLATFORM_CONFIG__: PlatformConfig | undefined;
  // eslint-disable-next-line no-var
  var __KB_RAW_CONFIG__: Record<string, unknown> | undefined;
}

type ILogger = PlatformContainer["logger"];

type RuntimeInitOptions = RuntimeSetupOptions;
type CliRuntimeInstance = Awaited<ReturnType<typeof createCliRuntime>>;
type CliExecutionContext = CliRuntimeInstance["context"];

export interface CliRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  version?: string;
  cwd?: string;
  /**
   * `import.meta.url` of the CLI entrypoint (`bin.ts`). Used to locate the
   * installed platform root reliably. Passed through to `initializePlatform`
   * and ultimately to `resolvePlatformRoot` in `@kb-labs/core-workspace`.
   */
  moduleUrl?: string;
  registerBuiltinCommands?: (
    input: { cwd: string; env: NodeJS.ProcessEnv; platformRoot?: string; projectRoot?: string },
  ) => Promise<void> | void;
  parseArgs?: typeof parseArgs;
  findCommand?: typeof findCommand;
  registry?: typeof registry;
  createJsonPresenter?: typeof createJsonPresenter;
  createTextPresenter?: typeof createTextPresenter;
  createRuntime?: (
    options: RuntimeInitOptions,
  ) => Promise<CliRuntimeInstance>;
  createRuntimeContext?: (
    options: RuntimeInitOptions,
  ) => Promise<CliExecutionContext>;
  runtimeExecutionLimits?: ExecutionLimits;
  runtimeMiddlewares?: MiddlewareConfig[];
  runtimeFormatters?: OutputFormatter[];
}

type LegacyLikeLogger = {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown> | Error): void;
  child(bindings: { category?: string; meta?: Record<string, unknown> }): LegacyLikeLogger;
};

function adaptPlatformLogger(logger: ILogger): LegacyLikeLogger {
  return {
    debug: (msg, meta) => logger.debug(msg, meta),
    info: (msg, meta) => logger.info(msg, meta),
    warn: (msg, meta) => logger.warn(msg, meta),
    error: (msg, metaOrError) => {
      if (metaOrError instanceof Error) {
        logger.error(msg, metaOrError);
        return;
      }
      logger.error(msg, undefined, metaOrError);
    },
    child: (bindings) => {
      const childBindings: Record<string, unknown> = {};
      if (bindings.category) {
        childBindings.category = bindings.category;
      }
      if (bindings.meta && typeof bindings.meta === "object") {
        Object.assign(childBindings, bindings.meta);
      }
      return adaptPlatformLogger(logger.child(childBindings));
    },
  };
}

export async function executeCli(
  argv: string[],
  options: CliRuntimeOptions = {},
): Promise<number | void> {
  const cwd = options.cwd ?? process.cwd();

  // Load .env file if present (does not override existing env vars).
  // Note: initializePlatform also loads .env via loadPlatformConfig, but
  // we keep this call as well because it reads from project cwd before we
  // even know where the platform root is. Duplicate loads are harmless —
  // loadEnvFile never overrides existing vars.
  loadEnvFile(cwd);

  // Initialize platform adapters from kb.config.json (before any plugin execution).
  // The moduleUrl lets the platform-root resolver locate node_modules/@kb-labs/*
  // in installed mode (where bin.js lives inside the platform installation).
  const {
    platform,
    platformConfig,
    rawConfig,
    platformRoot,
    projectRoot,
  } = await initializePlatform(cwd, options.moduleUrl);

  // Load .env from platformRoot and projectRoot after we know their paths.
  // This ensures API keys / tokens stored in ~/kb-platform/.env or the project
  // root are available even when the CLI is invoked from a different directory.
  // loadEnvFile never overrides already-set vars, so order: platform → project.
  if (platformRoot) { loadEnvFile(platformRoot); }
  if (projectRoot && projectRoot !== cwd) { loadEnvFile(projectRoot); }

  // Store platformConfig globally so CLI adapter can pass it to ExecutionContext
  globalThis.__KB_PLATFORM_CONFIG__ = platformConfig;

  // Store rawConfig globally so useConfig() can access it (parent process)
  globalThis.__KB_RAW_CONFIG__ = rawConfig;

  // Also store in env var so child processes can access it
  if (rawConfig) {
    process.env.KB_RAW_CONFIG_JSON = JSON.stringify(rawConfig);
  }

  const env = options.env ?? process.env;
  const version = resolveVersion(options.version, env);
  const parse = options.parseArgs ?? parseArgs;
  const find = options.findCommand ?? findCommand;
  const registryStore = options.registry ?? registry;
  const jsonPresenterFactory =
    options.createJsonPresenter ?? createJsonPresenter;
  const textPresenterFactory =
    options.createTextPresenter ?? createTextPresenter;
  const runtimeFactory =
    options.createRuntime ??
    (async (runtimeOptions: RuntimeInitOptions) => {
      const providedContext = options.createRuntimeContext
        ? await options.createRuntimeContext(runtimeOptions)
        : undefined;
      return createCliRuntime({
        ...runtimeOptions,
        context: providedContext,
      });
    });

  // Parse args EARLY to know about --debug flag before discovery
  const { cmdPath, rest, global, flagsObj } = parse(argv);

  applyLogLevel(global.debug, global.logLevel, env.KB_LOG_LEVEL);

  const cliLogger = createCliLogger(platform, cwd, version, argv, cmdPath, global);

  const registerCommands =
    options.registerBuiltinCommands ?? registerBuiltinCommands;
  // Pass logger to registerCommands so it can pass to discovery and registration.
  // Pass platformRoot/projectRoot so that plugin discovery:
  //  - scans the platform `node_modules` regardless of invocation cwd,
  //  - picks up project-scope plugins from `<projectRoot>/.kb/plugins/`,
  //  - tracks BOTH marketplace locks for cache invalidation.
  await registerCommands({ cwd, env, logger: cliLogger, platformRoot, projectRoot });

  const resolved = resolveCommand(cmdPath, rest, find, registryStore);
  if (resolved === null) { return 1; }
  const { cmd: resolvedCmd, normalizedCmdPath, actualRest } = resolved;
  let cmd = resolvedCmd;
  
  const presenter = global.json
    ? jsonPresenterFactory()
    : textPresenterFactory(global.quiet);
  
  // Create unified output and logger
  const output = createOutput({
    verbosity: global.quiet ? 'quiet' : global.debug ? 'debug' : 'normal',
    json: global.json,
    format: global.debug ? 'human' : 'human',
    category: 'cli',
  });
  
  const logger = cliLogger.child({
    category: "bootstrap",
    meta: {
      service: "runtime-bootstrap",
    },
  });

  // Debug logging AFTER logger is properly initialized
  logger.debug('[bootstrap] rawConfig', { state: rawConfig ? 'EXISTS' : 'UNDEFINED' });
  if (rawConfig) {
    logger.debug('[bootstrap] rawConfig keys', { keys: Object.keys(rawConfig) });
  }
  logger.debug('[bootstrap] Stored in globalThis.__KB_RAW_CONFIG__', {
    state: globalThis.__KB_RAW_CONFIG__ ? 'EXISTS' : 'UNDEFINED',
  });

  const runtimeMiddlewares =
    options.runtimeMiddlewares ?? getDefaultMiddlewares();

  // Create context with output and logger
  const cliContext = await createContext({
    presenter,
    logger,
    output,
    env,
    cwd,
    profileId: global.profile, // Pass global --profile flag or KB_PROFILE env var
    verbosity: global.quiet ? 'quiet' : (global.verbose ? 'verbose' : 'normal'),
    jsonMode: global.json || false,
  });

  const runtimeInitOptions: RuntimeInitOptions = {
    presenter,
    output,
    env,
    cwd,
    context: cliContext,
    executionLimits: options.runtimeExecutionLimits,
    middlewares: runtimeMiddlewares,
    formatters: options.runtimeFormatters,
  };
  const earlyExit = handleEarlyExits({
    global, version, cmdPath, normalizedCmdPath, flagsObj,
    presenter, registryStore, find,
  });
  if (earlyExit !== null) { return earlyExit; }

  // Refresh cmd after early-exit checks (may have found via find())
  if (!cmd) { cmd = find(normalizedCmdPath); }

  const cmdExit = handleCommandNotFound(cmd, normalizedCmdPath, presenter, global);
  if (cmdExit !== null) { return cmdExit; }

  return runCommand({
    runtimeFactory,
    runtimeInitOptions,
    cliContext,
    global,
    flagsObj,
    cmdPath,
    normalizedCmdPath,
    actualRest,
    presenter,
    registryStore,
    platform,
  });
}

interface RunCommandParams {
  runtimeFactory: (opts: RuntimeInitOptions) => Promise<CliRuntimeInstance>;
  runtimeInitOptions: RuntimeInitOptions;
  cliContext: CliExecutionContext;
  global: ReturnType<typeof parseArgs>['global'];
  flagsObj: ReturnType<typeof parseArgs>['flagsObj'];
  cmdPath: string[];
  normalizedCmdPath: string[];
  actualRest: string[];
  presenter: Presenter;
  registryStore: typeof registry;
  platform: PlatformContainer;
}

async function runCommand(p: RunCommandParams): Promise<number> {
  try {
    const runtime = await p.runtimeFactory(p.runtimeInitOptions);
    const context = p.cliContext;

    if (p.global.json && 'setContext' in p.presenter && typeof (p.presenter as { setContext?: unknown }).setContext === 'function') {
      (p.presenter as { setContext: (ctx: unknown) => void }).setContext(context);
    }

    if (p.global.help && p.cmdPath.length > 0) {
      const manifestCmd = p.registryStore.getManifestCommand(p.normalizedCmdPath.join(":"));
      if (manifestCmd) {
        renderManifestHelp(manifestCmd, p.presenter, p.global.json);
        return 0;
      }
    }

    return runtime.middleware.execute(context, () =>
      dispatchCommand(p, context),
    );
  } catch (error: unknown) {
    return handleExecutionError(error, p.presenter);
  }
}

function renderManifestHelp(manifestCmd: RegisteredCommand, presenter: Presenter, json: boolean | undefined): void {
  if (json) {
    presenter.json({
      ok: true,
      command: manifestCmd.manifest.id,
      manifest: {
        describe: manifestCmd.manifest.describe,
        longDescription: manifestCmd.manifest.longDescription,
        flags: manifestCmd.manifest.flags,
        examples: manifestCmd.manifest.examples,
        aliases: manifestCmd.manifest.aliases,
      },
    });
  } else {
    presenter.write(renderManifestCommandHelp(manifestCmd));
  }
}

async function dispatchCommand(p: RunCommandParams, context: CliExecutionContext): Promise<number> {
  const result = findCommandWithType(p.normalizedCmdPath);
  if (!result) {
    throw new Error(`Command ${p.normalizedCmdPath.join(":")} not found in registry`);
  }

  if (result.type === 'system') {
    if (!('run' in result.cmd)) {
      throw new Error(`System command ${p.normalizedCmdPath.join(":")} missing run() method`);
    }
    const v3Context = createSystemCommandContext(context, p.platform);
    const exitCode = await result.cmd.run(v3Context, p.actualRest, { ...p.global, ...p.flagsObj });
    return typeof exitCode === 'number' ? exitCode : 0;
  }

  if (result.type === 'plugin') {
    return dispatchPlugin(p, context);
  }

  throw new Error(`Unknown command type: ${result.type}`);
}

async function dispatchPlugin(p: RunCommandParams, context: CliExecutionContext): Promise<number> {
  const commandId = p.normalizedCmdPath.join(":");
  const manifestCmd = p.registryStore.getManifestCommand(commandId);

  // When execution.mode is 'in-process', skip gateway entirely and run locally.
  // Any other mode (worker-pool, auto, container) may still route through gateway
  // if a Host Agent socket or credentials are available.
  const rawConfig = globalThis.__KB_RAW_CONFIG__;
  const executionMode = (rawConfig?.execution as Record<string, unknown> | undefined)?.mode;

  if (executionMode !== 'in-process') {
    const gatewayClient = await tryResolveGateway();
    if (gatewayClient) {
      return executeViaGateway(gatewayClient, {
        commandId,
        argv: p.actualRest,
        flags: { ...p.global, ...p.flagsObj },
        manifestCmd,
      });
    }
  }

  const pluginExitCode = await executePlugin({
    context,
    commandId,
    argv: p.actualRest,
    flags: { ...p.global, ...p.flagsObj },
    manifestCmd,
    platform: p.platform,
  });

  if (pluginExitCode !== undefined) { return pluginExitCode; }

  throw new Error(`Plugin command ${commandId} is not available for execution. Ensure the command has a handlerPath in its manifest.`);
}

/** Minimal shape of a command group as returned by the registry's `get()`. */
interface CommandGroupLike {
  name: string;
  describe?: string;
  commands: Array<{ name: string; describe?: string; aliases?: string[] }>;
}

type AnyCommand = ReturnType<typeof findCommand> | RegisteredCommand;

interface ResolvedCommand {
  cmd: AnyCommand | undefined;
  normalizedCmdPath: string[];
  actualRest: string[];
}

function resolveCommand(
  cmdPath: string[],
  rest: string[],
  find: typeof findCommand,
  registryStore: typeof registry,
): ResolvedCommand | null {
  let normalizedCmdPath = normalizeCmdPath(cmdPath);
  let actualRest = rest;
  let cmd: AnyCommand | undefined = find(normalizedCmdPath);

  if (!cmd && cmdPath.length === 2) {
    const [groupName, commandName] = cmdPath;
    if (!groupName) { return null; }
    const maybeGroup = find([groupName]);
    if (maybeGroup && typeof maybeGroup === 'object' && 'commands' in maybeGroup && Array.isArray((maybeGroup as CommandGroupLike).commands)) {
      for (const groupCmd of (maybeGroup as CommandGroupLike).commands) {
        if (groupCmd.name === commandName || (commandName && groupCmd.aliases?.includes(commandName))) {
          cmd = groupCmd as AnyCommand;
          normalizedCmdPath = [groupCmd.name];
          break;
        }
      }
    }
  }

  if (!cmd && cmdPath.length > 2) {
    const maybeManifestId = cmdPath.join(":");
    const manifestCmd = registryStore.getManifestCommand(maybeManifestId);
    if (manifestCmd && manifestCmd.available && !manifestCmd.shadowed) {
      cmd = manifestCmd as AnyCommand;
      normalizedCmdPath = cmdPath;
    } else {
      for (let i = cmdPath.length - 1; i >= 1; i--) {
        const shorterPath = cmdPath.slice(0, i);
        const remainingArgs = cmdPath.slice(i);
        normalizedCmdPath = normalizeCmdPath(shorterPath);
        cmd = find(normalizedCmdPath);
        if (cmd) {
          actualRest = [...remainingArgs, ...rest];
          break;
        }
      }
    }
  }

  return { cmd, normalizedCmdPath, actualRest };
}

interface EarlyExitParams {
  global: ReturnType<typeof parseArgs>['global'];
  version: string;
  cmdPath: string[];
  normalizedCmdPath: string[];
  flagsObj: ReturnType<typeof parseArgs>['flagsObj'];
  presenter: Presenter;
  registryStore: typeof registry;
  find: typeof findCommand;
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
const VALID_LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];

function resolveLogLevel(debug: unknown, logLevelFlag: unknown, envLevel: string | undefined): LogLevel {
  if (debug) { return 'debug'; }
  const raw = String(logLevelFlag ?? envLevel ?? 'silent').toLowerCase();
  return (VALID_LOG_LEVELS.includes(raw as LogLevel) ? raw as LogLevel : 'silent');
}

function applyLogLevel(debug: unknown, logLevelFlag: unknown, envLevel: string | undefined): void {
  const logLevel = resolveLogLevel(debug, logLevelFlag, envLevel);
  if (!process.env.LOG_LEVEL && !process.env.KB_LOG_LEVEL) {
    process.env.KB_LOG_LEVEL = logLevel;
  }
  if (debug) { process.env.DEBUG_SANDBOX = '1'; }
}

function createCliLogger(
  platform: PlatformContainer,
  cwd: string,
  version: string,
  argv: string[],
  cmdPath: string[],
  global: { json?: unknown; quiet?: unknown; debug?: unknown },
): ILogger {
  const requestId = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const logger = platform.logger.child({
    layer: 'cli',
    cwd,
    version,
    requestId,
    reqId: requestId,
    traceId: `trace-${crypto.randomUUID()}`,
    spanId: `span-${crypto.randomUUID()}`,
    invocationId: `inv-${crypto.randomUUID()}`,
    argv,
  });
  logger.info('CLI invocation started', {
    commandPath: cmdPath.join(' '),
    argsCount: argv.length,
    jsonMode: Boolean(global.json),
    quietMode: Boolean(global.quiet),
    debugMode: Boolean(global.debug),
  });
  return logger;
}

function handleEarlyExits(p: EarlyExitParams): number | null {
  if (p.global.help && p.cmdPath.length === 0) {
    if (p.global.json) {
      p.presenter.json({ ok: false, error: { code: "CMD_NOT_FOUND", message: "Use text mode for help display" } });
    } else {
      p.presenter.write(renderGlobalHelpNew(p.registryStore));
    }
    return 0;
  }

  if (p.global.version) {
    if (p.global.json) {
      p.presenter.json({ ok: true, version: p.version });
    } else {
      p.presenter.write(p.version);
    }
    return 0;
  }

  if (shouldShowLimits(p.flagsObj)) {
    return handleLimitFlag({
      cmdPath: p.normalizedCmdPath,
      presenter: p.presenter,
      registry: p.registryStore,
      asJson: Boolean(p.global.json),
    });
  }

  if (p.global.help && p.normalizedCmdPath.length > 0) {
    const maybeId = p.normalizedCmdPath.join(":");
    const manifestCmd = p.registryStore.getManifestCommand(maybeId);
    if (manifestCmd) {
      renderManifestHelp(manifestCmd, p.presenter, p.global.json);
      return 0;
    }
  }

  if (p.cmdPath.length === 1 && p.cmdPath[0]) {
    const groupPrefix = p.cmdPath[0];
    const matchingGroups = p.registryStore.getGroupsByPrefix?.(groupPrefix);
    if (matchingGroups && matchingGroups.length > 0) {
      const decision = resolveGroupDisplay(groupPrefix, matchingGroups);
      if (decision.kind === 'exact') {
        if (p.global.json) {
          p.presenter.json({
            ok: true,
            group: {
              name: decision.group.name,
              describe: decision.group.describe,
              commands: decision.group.commands.map((c) => ({ name: c.name, describe: c.describe })),
            },
          });
        } else {
          p.presenter.write(renderGroupHelp(decision.group as unknown as Parameters<typeof renderGroupHelp>[0]));
        }
        return 0;
      }
      renderGroupsHelp(groupPrefix, matchingGroups, p.presenter, p.global.json);
      return 0;
    }

    const productCommands = p.registryStore.getCommandsByGroup(p.cmdPath[0]);
    if (productCommands.length > 0) {
      if (p.global.json) {
        p.presenter.json({ ok: false, error: { code: "CMD_NOT_FOUND", message: `Product '${p.cmdPath[0]}' requires a subcommand` } });
      } else {
        p.presenter.write(renderProductHelp(p.cmdPath[0], productCommands));
      }
      return 0;
    }
  }

  return null;
}

/**
 * Decide how to render the result of a prefix match against command groups.
 *
 * - `exact`: the prefix equals one of the group names → render that group's
 *   commands (e.g. `kb info` shows hello/version/health/diag).
 * - `list`: the prefix only matches subgroups (e.g. `marketplace:plugins`) →
 *   render the list of matching groups.
 *
 * Pure function (no side effects) so it can be unit-tested in isolation.
 * Regression guard for the `kb info` bug where exact matches were rendered
 * as a one-item "info groups: info" list.
 */
export type GroupDisplayDecision =
  | { kind: 'exact'; group: CommandGroupLike }
  | { kind: 'list'; groups: CommandGroupLike[] };

export function resolveGroupDisplay(groupPrefix: string, matchingGroups: CommandGroupLike[]): GroupDisplayDecision {
  const exact = matchingGroups.find((g) => g?.name === groupPrefix);
  if (exact) {
    return { kind: 'exact', group: exact };
  }
  return { kind: 'list', groups: matchingGroups };
}

function renderGroupsHelp(groupPrefix: string, matchingGroups: CommandGroupLike[], presenter: Presenter, json: boolean | undefined): void {
  if (json) {
    presenter.json({
      ok: true,
      groups: matchingGroups.map((g) => ({
        name: g.name,
        describe: g.describe,
        commands: g.commands.map((c) => ({ name: c.name, describe: c.describe }))
      }))
    });
  } else {
    const lines: string[] = [colors.bold(`${groupPrefix} groups:`), ''];
    for (const group of matchingGroups) {
      lines.push(`  ${colors.cyan(group.name.padEnd(20))}  ${colors.dim(group.describe ?? '')}`);
    }
    lines.push('');
    lines.push(colors.dim(`Use 'kb ${groupPrefix} <group> --help' to see commands for a specific group.`));
    presenter.write(lines.join('\n'));
  }
}

function handleCommandNotFound(
  cmd: AnyCommand | undefined,
  normalizedCmdPath: string[],
  presenter: Presenter,
  global: ReturnType<typeof parseArgs>['global'],
): number | null {
  if (!cmd) {
    const msg = `Unknown command: ${normalizedCmdPath.join(" ") || "(none)"}`;
    if (global.json) {
      presenter.json({ ok: false, error: { code: "CMD_NOT_FOUND", message: msg } });
    } else {
      presenter.error(msg);
    }
    return 1;
  }

  if (typeof cmd === 'object' && cmd !== null && 'commands' in cmd && Array.isArray((cmd as CommandGroupLike).commands)) {
    const group = cmd as CommandGroupLike;
    if (global.json) {
      presenter.json({ ok: false, error: { code: "CMD_NOT_FOUND", message: `Group '${group.name}' requires a subcommand` } });
    } else {
      presenter.write(renderGroupHelp(group as Parameters<typeof renderGroupHelp>[0]));
    }
    return 0;
  }

  return null;
}

function handleExecutionError(
  error: unknown,
  presenter: Presenter,
): number {
  if (error instanceof CliError) {
    const exitCode = mapCliErrorToExitCode(error.code);
    const diagnostics: unknown[] = [];

    // Check if presenter is in JSON mode before calling json()
    if (presenter.isJSON && typeof presenter.json === "function") {
      presenter.json({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details != null && { details: error.details }),
        },
        ...(diagnostics.length > 0 && {
          warnings: diagnostics,
        }),
      });
    } else if (typeof presenter.error === "function") {
      presenter.error(`${error.code}: ${error.message}`);
    }
    return exitCode;
  }

  const message = error instanceof Error ? error.message : String(error);
  const diagnostics: unknown[] = [];

  // Check if presenter is in JSON mode before calling json()
  if (presenter.isJSON && typeof presenter.json === "function") {
    presenter.json({
      ok: false,
      error: { message },
      ...(diagnostics.length > 0 && {
        warnings: diagnostics,
      }),
    });
  } else if (typeof presenter.error === "function") {
    presenter.error(message);
  }
  return 1;
}
