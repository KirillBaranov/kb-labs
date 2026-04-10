import * as path2 from 'path';
import 'fs';
import { randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import * as net from 'net';
import { initPlatform } from '@kb-labs/core-runtime';
import { createRequire } from 'module';
import { EventEmitter } from 'events';

// ../plugin-contracts/dist/index.js
const PluginError = class _PluginError extends Error {
  /**
   * Error code for programmatic handling
   */
  code;
  /**
   * Additional error details
   */
  details;
  constructor(message, code, details) {
    super(message);
    this.name = "PluginError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
  /**
   * Convert to JSON-serializable object (for IPC)
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack
    };
  }
  /**
   * Create from serialized error (from IPC)
   */
  static fromJSON(data) {
    const error = new _PluginError(data.message, data.code, data.details);
    error.stack = data.stack;
    return error;
  }
};
const PermissionError = class extends PluginError {
  constructor(message, details) {
    super(message, "PERMISSION_DENIED", details);
    this.name = "PermissionError";
  }
};
function wrapError(error, defaultCode = "INTERNAL_ERROR") {
  if (error instanceof PluginError) {
    return error;
  }
  if (error instanceof Error) {
    return new PluginError(error.message, defaultCode, {
      originalName: error.name,
      stack: error.stack
    });
  }
  return new PluginError(String(error), defaultCode);
}
const CSI = "\x1B[";
const RESET = "\x1B[0m";
const createColor = (...codes) => (text) => `${CSI}${codes.join(";")}m${text}${RESET}`;
const accentBlue = "38;5;39";
const accentViolet = "38;5;99";
const accentTeal = "38;5;51";
const accentIndigo = "38;5;63";
const neutral = 37;
const neutralMuted = 90;
const colors = {
  // Semantic colors
  success: createColor(32),
  error: createColor(31),
  warning: createColor(33),
  info: createColor(36),
  // Accent palette (reused across CLI)
  primary: createColor(accentBlue),
  accent: createColor(accentViolet),
  highlight: createColor(accentTeal),
  secondary: createColor(accentIndigo),
  emphasis: createColor("38;5;117"),
  muted: createColor(neutralMuted),
  foreground: createColor(neutral),
  // Formatting helpers
  dim: createColor(2),
  bold: createColor(1),
  underline: createColor(4),
  inverse: createColor(7)
};
const symbolCharacters = {
  success: "OK",
  error: "ERR",
  warning: "WARN",
  info: "\u2139",
  bullet: "\u2022",
  clock: "TIME",
  folder: "DIR",
  package: "\u203A",
  pointer: "\u203A",
  section: "\u2502"
};
const symbols = {
  success: colors.success(symbolCharacters.success),
  error: colors.error(symbolCharacters.error),
  warning: colors.warning(symbolCharacters.warning),
  info: colors.info(symbolCharacters.info),
  bullet: colors.muted(symbolCharacters.bullet),
  clock: colors.info(symbolCharacters.clock),
  folder: colors.primary(symbolCharacters.folder),
  package: colors.accent(symbolCharacters.package),
  pointer: colors.primary(symbolCharacters.pointer),
  section: colors.primary(symbolCharacters.section)
};
const isTruthyEnv = (value) => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "off";
};
const supportsColor = (() => {
  if (typeof process === "undefined") {
    return false;
  }
  const forceColor = process.env.FORCE_COLOR;
  if (isTruthyEnv(process.env.NO_COLOR)) {
    return false;
  }
  if (isTruthyEnv(forceColor)) {
    return true;
  }
  if (!process.stdout) {
    return false;
  }
  if (process.stdout.isTTY === false) {
    return false;
  }
  return true;
})();
const passthrough = (fn) => (text) => supportsColor ? fn(text) : text;
const safeColors = {
  success: passthrough(colors.success),
  error: passthrough(colors.error),
  warning: passthrough(colors.warning),
  info: passthrough(colors.info),
  accent: passthrough(colors.accent),
  primary: passthrough(colors.primary),
  highlight: passthrough(colors.highlight),
  secondary: passthrough(colors.secondary),
  emphasis: passthrough(colors.emphasis),
  foreground: passthrough(colors.foreground),
  muted: passthrough(colors.muted),
  dim: passthrough(colors.dim),
  bold: passthrough(colors.bold),
  underline: passthrough(colors.underline),
  inverse: passthrough(colors.inverse)
};
const safeSymbols = {
  success: supportsColor ? symbols.success : "\u2713",
  error: supportsColor ? symbols.error : "\u2717",
  warning: supportsColor ? symbols.warning : "\u26A0",
  info: supportsColor ? symbols.info : "\u2192",
  bullet: supportsColor ? symbols.bullet : "\u2022",
  clock: supportsColor ? symbols.clock : "time",
  folder: supportsColor ? symbols.folder : "dir",
  package: supportsColor ? symbols.package : "\u203A",
  pointer: supportsColor ? symbols.pointer : ">",
  section: supportsColor ? symbols.section : "|",
  // Box-drawing characters for modern side border
  separator: "\u2500",
  // Horizontal line
  border: "\u2502",
  // Vertical line
  topLeft: "\u250C",
  // Top-left corner
  topRight: "\u2510",
  // Top-right corner
  bottomLeft: "\u2514",
  // Bottom-left corner
  bottomRight: "\u2518",
  // Bottom-right corner
  leftT: "\u251C",
  // Left T-junction
  rightT: "\u2524"
  // Right T-junction
};
function formatTiming(ms) {
  if (ms < 1e3) {
    return `${ms}ms`;
  } else if (ms < 6e4) {
    return `${(ms / 1e3).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 6e4);
    const seconds = (ms % 6e4 / 1e3).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}
function sideBorderBox(options) {
  const { title, sections, footer, status, timing } = options;
  const lines = [];
  const titleLine = `${safeSymbols.topLeft}${safeSymbols.separator.repeat(2)} ${safeColors.primary(safeColors.bold(title))}`;
  lines.push(titleLine);
  lines.push(safeSymbols.border);
  for (let i = 0; i < sections.length; i++) {
    const section2 = sections[i];
    if (!section2) {continue;}
    if (section2.header) {
      lines.push(`${safeSymbols.border} ${safeColors.bold(section2.header)}`);
    }
    for (const item of section2.items) {
      lines.push(`${safeSymbols.border}  ${item}`);
    }
    if (i < sections.length - 1) {
      lines.push(safeSymbols.border);
    }
  }
  if (footer || status || timing !== void 0) {
    lines.push(safeSymbols.border);
    const footerParts = [];
    if (footer) {
      footerParts.push(footer);
    } else if (status) {
      const statusSymbol = getStatusSymbol(status);
      const statusText = getStatusText(status);
      const statusColor = getStatusColor(status);
      footerParts.push(statusColor(`${statusSymbol} ${statusText}`));
    }
    if (timing !== void 0) {
      footerParts.push(formatTiming2(timing));
    }
    const footerLine = `${safeSymbols.bottomLeft}${safeSymbols.separator.repeat(2)} ${footerParts.join(" / ")}`;
    lines.push(footerLine);
  }
  return lines.join("\n");
}
var formatTiming2 = formatTiming;
function getStatusSymbol(status) {
  switch (status) {
    case "success":
      return safeSymbols.success;
    case "error":
      return safeSymbols.error;
    case "warning":
      return safeSymbols.warning;
    case "info":
      return safeSymbols.info;
  }
}
function getStatusText(status) {
  switch (status) {
    case "success":
      return "Success";
    case "error":
      return "Failed";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
  }
}
function getStatusColor(status) {
  switch (status) {
    case "success":
      return safeColors.success;
    case "error":
      return safeColors.error;
    case "warning":
      return safeColors.warning;
    case "info":
      return safeColors.info;
  }
}
function createId() {
  return randomBytes(16).toString("hex");
}
function extractTraceId(requestId) {
  const colonIndex = requestId.indexOf(":");
  if (colonIndex > 0) {
    return requestId.substring(0, colonIndex);
  }
  return requestId;
}

// src/context/trace.ts
function createTraceContext(options) {
  const { traceId, spanId, parentSpanId, logger } = options;
  return {
    traceId,
    spanId,
    parentSpanId,
    addEvent(name, eventAttributes) {
      logger.debug(`[trace] ${name}`, {
        traceId,
        spanId,
        ...eventAttributes
      });
    },
    setAttribute(key, value) {
    },
    recordError(error) {
      this.addEvent("exception", {
        "exception.type": error.name,
        "exception.message": error.message,
        "exception.stacktrace": error.stack
      });
    }
  };
}
const DENIED_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /\.env$/,
  /\.env\./,
  /\.ssh/,
  /\/etc\//,
  /\/usr\//,
  /\/var\//,
  /credentials/i,
  /secret/i,
  /password/i,
  /\.pem$/,
  /\.key$/
];
function createFSShim(options) {
  const { permissions, cwd, outdir } = options;
  const readablePaths = /* @__PURE__ */ new Set([
    path2.resolve(cwd),
    // cwd always allowed for reading
    ...(permissions.fs?.read ?? []).map((p) => path2.resolve(cwd, p))
  ]);
  const writablePaths = /* @__PURE__ */ new Set([
    outdir ? path2.resolve(outdir) : path2.resolve(cwd, ".kb/output"),
    // outdir always allowed
    ...(permissions.fs?.write ?? []).map((p) => path2.resolve(cwd, p))
  ]);
  function normalizePath(filePath) {
    return path2.normalize(path2.resolve(cwd, filePath));
  }
  function checkDeniedPatterns(normalizedPath) {
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(normalizedPath)) {
        throw new PermissionError(`Access denied: path matches denied pattern`, {
          path: normalizedPath,
          pattern: pattern.toString()
        });
      }
    }
  }
  function checkReadPermission(filePath) {
    const normalized = normalizePath(filePath);
    checkDeniedPatterns(normalized);
    const isAllowed = Array.from(readablePaths).some(
      (allowed) => normalized.startsWith(allowed)
    );
    if (!isAllowed) {
      throw new PermissionError(`Read access denied`, { path: filePath });
    }
    return normalized;
  }
  function checkWritePermission(filePath) {
    const normalized = normalizePath(filePath);
    checkDeniedPatterns(normalized);
    const isAllowed = Array.from(writablePaths).some(
      (allowed) => normalized.startsWith(allowed)
    );
    if (!isAllowed) {
      throw new PermissionError(`Write access denied`, { path: filePath });
    }
    return normalized;
  }
  return {
    async readFile(filePath, encoding = "utf-8") {
      const resolved = checkReadPermission(filePath);
      return fs.readFile(resolved, encoding);
    },
    async readFileBuffer(filePath) {
      const resolved = checkReadPermission(filePath);
      const buffer = await fs.readFile(resolved);
      return new Uint8Array(buffer);
    },
    async writeFile(filePath, content, options2) {
      const resolved = checkWritePermission(filePath);
      await fs.mkdir(path2.dirname(resolved), { recursive: true });
      const writeOptions = {
        encoding: options2?.encoding ?? "utf-8"
      };
      if (options2?.append) {
        writeOptions.flag = "a";
      }
      await fs.writeFile(resolved, content, writeOptions);
    },
    async readdir(dirPath) {
      const resolved = checkReadPermission(dirPath);
      return fs.readdir(resolved);
    },
    async readdirWithStats(dirPath) {
      const resolved = checkReadPermission(dirPath);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory()
      }));
    },
    async stat(filePath) {
      const resolved = checkReadPermission(filePath);
      const stats = await fs.stat(resolved);
      return {
        isFile: () => stats.isFile(),
        isDirectory: () => stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtimeMs,
        ctime: stats.ctimeMs
      };
    },
    async exists(filePath) {
      try {
        const resolved = checkReadPermission(filePath);
        await fs.access(resolved);
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(dirPath, options2) {
      const resolved = checkWritePermission(dirPath);
      await fs.mkdir(resolved, { recursive: options2?.recursive ?? false });
    },
    async rm(filePath, options2) {
      const resolved = checkWritePermission(filePath);
      await fs.rm(resolved, {
        recursive: options2?.recursive ?? false,
        force: options2?.force ?? false
      });
    },
    async copy(src, dest) {
      const resolvedSrc = checkReadPermission(src);
      const resolvedDest = checkWritePermission(dest);
      await fs.mkdir(path2.dirname(resolvedDest), { recursive: true });
      await fs.cp(resolvedSrc, resolvedDest, { recursive: true });
    },
    async move(src, dest) {
      const resolvedSrc = checkWritePermission(src);
      const resolvedDest = checkWritePermission(dest);
      await fs.mkdir(path2.dirname(resolvedDest), { recursive: true });
      await fs.rename(resolvedSrc, resolvedDest);
    },
    resolve(filePath) {
      return path2.resolve(cwd, filePath);
    },
    relative(filePath) {
      return path2.relative(cwd, filePath);
    },
    join(...segments) {
      return path2.join(...segments);
    },
    dirname(filePath) {
      return path2.dirname(filePath);
    },
    basename(filePath, ext) {
      return path2.basename(filePath, ext);
    },
    extname(filePath) {
      return path2.extname(filePath);
    }
  };
}

// src/runtime/fetch-shim.ts
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function createFetchShim(options) {
  const { permissions } = options;
  const allowedPatterns = (permissions.network?.fetch ?? []).map((pattern) => ({
    pattern,
    regex: globToRegex(pattern)
  }));
  return async (input, init) => {
    let url;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = input.url;
    }
    const isAllowed = allowedPatterns.some(({ regex }) => regex.test(url));
    if (!isAllowed) {
      throw new PermissionError(`Network access denied`, {
        url,
        allowedPatterns: permissions.network?.fetch ?? []
      });
    }
    return globalThis.fetch(input, init);
  };
}

// src/runtime/env-shim.ts
const ALWAYS_ALLOWED = [
  "NODE_ENV",
  "CI",
  "DEBUG",
  "TZ",
  "LANG",
  "LC_ALL"
];
function createEnvShim(options) {
  const { permissions } = options;
  const allowedPatterns = permissions.env?.read ?? [];
  return (key) => {
    if (ALWAYS_ALLOWED.includes(key)) {
      return process.env[key];
    }
    const isAllowed = allowedPatterns.some((pattern) => {
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        return key.startsWith(prefix);
      }
      return key === pattern;
    });
    if (!isAllowed) {
      return void 0;
    }
    return process.env[key];
  };
}

// src/runtime/index.ts
function createRuntimeAPI(options) {
  const { permissions, cwd, outdir } = options;
  return {
    fs: createFSShim({ permissions, cwd, outdir }),
    fetch: createFetchShim({ permissions }),
    env: createEnvShim({ permissions })
  };
}

// src/api/lifecycle.ts
function createLifecycleAPI(cleanupStack) {
  return {
    onCleanup(fn) {
      cleanupStack.push(fn);
    }
  };
}
async function executeCleanup(cleanupStack, logger, timeoutMs = 5e3) {
  const reversed = [...cleanupStack].reverse();
  for (const cleanup of reversed) {
    try {
      await Promise.race([
        cleanup(),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Cleanup timeout")), timeoutMs)
        )
      ]);
    } catch (error) {
      logger.warn("Cleanup failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// src/api/state.ts
function createStateAPI(options) {
  const { pluginId, tenantId, cache } = options;
  function prefixKey(key) {
    const tenant = tenantId ?? "default";
    return `${tenant}:${pluginId}:${key}`;
  }
  return {
    async get(key) {
      const value = await cache.get(prefixKey(key));
      return value ?? void 0;
    },
    async set(key, value, ttlMs) {
      await cache.set(prefixKey(key), value, ttlMs);
    },
    async delete(key) {
      await cache.delete(prefixKey(key));
    },
    async has(key) {
      const value = await cache.get(prefixKey(key));
      return value !== null && value !== void 0;
    },
    async getMany(keys) {
      const result = /* @__PURE__ */ new Map();
      await Promise.all(
        keys.map(async (key) => {
          const value = await cache.get(prefixKey(key));
          if (value !== null && value !== void 0) {
            result.set(key, value);
          }
        })
      );
      return result;
    },
    async setMany(entries, ttlMs) {
      const entriesArray = entries instanceof Map ? Array.from(entries.entries()) : Object.entries(entries);
      await Promise.all(
        entriesArray.map(
          ([key, value]) => cache.set(prefixKey(key), value, ttlMs)
        )
      );
    }
  };
}
function createArtifactsAPI(options) {
  const { outdir } = options;
  async function ensureOutdir() {
    await fs.mkdir(outdir, { recursive: true });
  }
  function artifactPath(name) {
    return path2.join(outdir, name);
  }
  return {
    async write(name, content) {
      await ensureOutdir();
      const filePath = artifactPath(name);
      await fs.mkdir(path2.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
      return filePath;
    },
    async list() {
      try {
        await ensureOutdir();
        const entries = await fs.readdir(outdir, { withFileTypes: true });
        const artifacts = [];
        for (const entry of entries) {
          if (entry.isFile()) {
            const filePath = path2.join(outdir, entry.name);
            const stats = await fs.stat(filePath);
            artifacts.push({
              name: entry.name,
              path: filePath,
              size: stats.size,
              createdAt: stats.ctimeMs
            });
          }
        }
        return artifacts;
      } catch {
        return [];
      }
    },
    async read(name) {
      return fs.readFile(artifactPath(name), "utf-8");
    },
    async readBuffer(name) {
      const buffer = await fs.readFile(artifactPath(name));
      return new Uint8Array(buffer);
    },
    async exists(name) {
      try {
        await fs.access(artifactPath(name));
        return true;
      } catch {
        return false;
      }
    },
    path(name) {
      return artifactPath(name);
    }
  };
}
const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=",
  ":(){:|:&};:",
  // Fork bomb
  "chmod -R 777 /",
  "chown -R",
  "> /dev/sda",
  "mv /* "
];
function createShellAPI(options) {
  const { permissions, cwd } = options;
  if (!permissions.shell?.allowed) {
    return {
      async exec() {
        throw new PermissionError("Shell execution not allowed");
      }
    };
  }
  const allowedCommands = permissions.shell.commands ?? [];
  return {
    async exec(command, args = [], execOptions) {
      const fullCommand = `${command} ${args.join(" ")}`;
      for (const blocked of BLOCKED_COMMANDS) {
        if (fullCommand.includes(blocked)) {
          throw new PermissionError(`Dangerous command blocked`, {
            command: fullCommand,
            blocked
          });
        }
      }
      if (allowedCommands.length > 0 && !allowedCommands.includes(command)) {
        throw new PermissionError(`Command not in whitelist`, {
          command,
          allowedCommands
        });
      }
      const workingDir = execOptions?.cwd ?? cwd;
      const timeout = execOptions?.timeout ?? 3e4;
      const throwOnError = execOptions?.throwOnError ?? false;
      return new Promise((resolve2, reject) => {
        const child = spawn(command, args, {
          cwd: workingDir,
          shell: true,
          env: {
            ...process.env,
            ...execOptions?.env
          }
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timeoutId = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeout);
        child.stdout?.on("data", (data) => {
          stdout += data.toString();
        });
        child.stderr?.on("data", (data) => {
          stderr += data.toString();
        });
        child.on("close", (code) => {
          clearTimeout(timeoutId);
          if (timedOut) {
            reject(new Error(`Command timed out after ${timeout}ms`));
            return;
          }
          const exitCode = code ?? 0;
          const result = {
            code: exitCode,
            stdout,
            stderr,
            ok: exitCode === 0
          };
          if (throwOnError && exitCode !== 0) {
            reject(new Error(`Command failed with code ${exitCode}: ${stderr}`));
          } else {
            resolve2(result);
          }
        });
        child.on("error", (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
    }
  };
}

// src/api/events.ts
function createEventsAPI(options) {
  const { pluginId, emitter } = options;
  return {
    async emit(event, payload) {
      const prefixedEvent = `${pluginId}:${event}`;
      await emitter(prefixedEvent, payload);
    }
  };
}
function createNoopEventsAPI() {
  return {
    async emit() {
    }
  };
}

// src/api/invoke.ts
function createInvokeAPI(options) {
  const { permissions, invoker } = options;
  if (!permissions.invoke?.allowed) {
    return {
      async call() {
        throw new PermissionError("Plugin invocation not allowed");
      }
    };
  }
  const allowedPlugins = permissions.invoke.plugins ?? [];
  return {
    async call(pluginId, input, invokeOptions) {
      if (allowedPlugins.length > 0 && !allowedPlugins.includes(pluginId)) {
        throw new PermissionError(`Plugin not in whitelist`, {
          pluginId,
          allowedPlugins
        });
      }
      return invoker(pluginId, input, invokeOptions);
    }
  };
}
function createNoopInvokeAPI() {
  return {
    async call() {
      throw new PermissionError("Plugin invocation not allowed");
    }
  };
}

// src/api/index.ts
function createPluginAPI(options) {
  const {
    pluginId,
    tenantId,
    cwd,
    outdir,
    permissions,
    cache,
    eventEmitter,
    pluginInvoker,
    cleanupStack
  } = options;
  return {
    lifecycle: createLifecycleAPI(cleanupStack),
    state: createStateAPI({ pluginId, tenantId, cache }),
    artifacts: createArtifactsAPI({ outdir }),
    shell: createShellAPI({ permissions, cwd }),
    events: eventEmitter ? createEventsAPI({ pluginId, emitter: eventEmitter }) : createNoopEventsAPI(),
    invoke: pluginInvoker ? createInvokeAPI({ permissions, invoker: pluginInvoker }) : createNoopInvokeAPI()
  };
}

// src/context/context-factory.ts
function createPluginContextV3(options) {
  const { descriptor, platform, ui, signal, eventEmitter, pluginInvoker } = options;
  const spanId = createId();
  const traceId = descriptor.parentRequestId ? extractTraceId(descriptor.parentRequestId) : createId();
  const requestId = `${traceId}:${spanId}`;
  const cleanupStack = [];
  const trace = createTraceContext({
    traceId,
    spanId,
    parentSpanId: descriptor.parentRequestId ? descriptor.parentRequestId.split(":")[1] : void 0,
    logger: platform.logger
  });
  const runtime = createRuntimeAPI({
    permissions: descriptor.permissions,
    cwd: descriptor.cwd,
    outdir: descriptor.outdir
  });
  const outdir = descriptor.outdir ?? `${descriptor.cwd}/.kb/output`;
  const api = createPluginAPI({
    pluginId: descriptor.pluginId,
    tenantId: descriptor.tenantId,
    cwd: descriptor.cwd,
    outdir,
    permissions: descriptor.permissions,
    cache: platform.cache,
    eventEmitter,
    pluginInvoker,
    cleanupStack
  });
  const context = {
    // Metadata
    host: descriptor.host,
    requestId,
    pluginId: descriptor.pluginId,
    pluginVersion: descriptor.pluginVersion,
    tenantId: descriptor.tenantId,
    cwd: descriptor.cwd,
    outdir,
    config: descriptor.config,
    // Cancellation
    signal,
    // Tracing
    trace,
    // Host-specific
    hostContext: descriptor.hostContext,
    // Services
    ui,
    platform,
    // ← Direct passthrough of platform services
    runtime,
    api
  };
  return {
    context,
    cleanupStack,
    requestId,
    traceId,
    spanId
  };
}
const UnixSocketClient = class {
  socket = null;
  pending = /* @__PURE__ */ new Map();
  closed = false;
  connecting = false;
  buffer = "";
  reconnectAttempts = 0;
  socketPath;
  constructor(config = {}) {
    this.socketPath = config.socketPath ?? "/tmp/kb-ipc.sock";
  }
  /**
   * Connect to Unix socket server.
   */
  async connect() {
    if (this.socket && !this.socket.destroyed) {
      return;
    }
    if (this.connecting) {
      await new Promise((resolve2) => setTimeout(resolve2, 100));
      return this.connect();
    }
    this.connecting = true;
    return new Promise((resolve2, reject) => {
      this.socket = net.connect(this.socketPath);
      this.socket.on("connect", () => {
        this.connecting = false;
        this.reconnectAttempts = 0;
        resolve2();
      });
      this.socket.on("error", (error) => {
        this.connecting = false;
        reject(new Error(`Unix socket connection failed: ${error.message}`));
      });
      this.socket.on("data", (data) => {
        this.handleData(data);
      });
      this.socket.on("close", () => {
        if (!this.closed) {
          this.socket = null;
        }
      });
    });
  }
  /**
   * Send RPC call to parent process.
   */
  async call(adapter, method, args, timeout) {
    if (this.closed) {
      throw new Error("Client is closed");
    }
    await this.connect();
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Socket not available");
    }
    const requestId = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timeoutMs = timeout ?? 3e4;
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`RPC call timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (response) => {
          if (response.error) {
            reject(new Error(String(response.error)));
          } else {
            resolve2(response.result);
          }
        },
        reject,
        timer
      });
      const request = {
        type: "adapter:call",
        requestId,
        adapter,
        method,
        args,
        timeout: timeoutMs
      };
      const message = JSON.stringify(request) + "\n";
      this.socket.write(message, "utf8", (error) => {
        if (error) {
          const pending = this.pending.get(requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(requestId);
            reject(new Error(`Failed to write to socket: ${error.message}`));
          }
        }
      });
    });
  }
  /**
   * Handle incoming data from Unix socket.
   */
  handleData(data) {
    this.buffer += data.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim().length === 0) {
        continue;
      }
      try {
        const msg = JSON.parse(line);
        this.handleMessage(msg);
      } catch (error) {
        console.error("[UnixSocketClient] Failed to parse message:", error);
      }
    }
  }
  handleMessage(msg) {
    if (!msg || typeof msg !== "object" || !("type" in msg) || msg.type !== "adapter:response") {
      return;
    }
    const response = msg;
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);
    pending.resolve(response);
  }
  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Client closed"));
    }
    this.pending.clear();
  }
  isClosed() {
    return this.closed;
  }
};

// src/sandbox/platform-client.ts
function createSubprocessLogger() {
  const log = (level, msg, meta) => {
    const prefix = `[${level.toUpperCase()}]`;
    if (meta) {
      console.log(`${prefix} ${msg}`, meta);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  };
  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, _error, meta) => log("error", msg, meta),
    trace: (msg, meta) => log("trace", msg, meta),
    child: (_bindings) => createSubprocessLogger()
  };
}
let rpcClient = null;
async function connectToPlatform(socketPath) {
  if (!socketPath) {
    throw new Error("Socket path is required for platform RPC connection");
  }
  rpcClient = new UnixSocketClient({ socketPath });
  await rpcClient.connect();
  return {
    // Logger runs in subprocess - doesn't need RPC
    logger: createSubprocessLogger(),
    // LLM service via RPC
    llm: {
      complete: async (prompt, options) => {
        return rpcClient.call("llm", "complete", [prompt, options]);
      },
      stream: async function* (prompt, options) {
        const response = await rpcClient.call("llm", "complete", [prompt, options]);
        yield response.content;
      }
    },
    // Embeddings service via RPC
    embeddings: {
      embed: async (text) => {
        return rpcClient.call("embeddings", "embed", [text]);
      },
      embedBatch: async (texts) => {
        return rpcClient.call("embeddings", "embedBatch", [texts]);
      },
      dimensions: 1536,
      // Default OpenAI dimensions
      getDimensions: async () => {
        return rpcClient.call("embeddings", "getDimensions", []);
      }
    },
    // VectorStore service via RPC
    vectorStore: {
      search: async (query, limit, filter) => {
        return rpcClient.call("vectorStore", "search", [query, limit, filter]);
      },
      upsert: async (vectors) => {
        return rpcClient.call("vectorStore", "upsert", [vectors]);
      },
      delete: async (ids) => {
        return rpcClient.call("vectorStore", "delete", [ids]);
      },
      count: async () => {
        return rpcClient.call("vectorStore", "count", []);
      }
    },
    // Cache service via RPC
    cache: {
      get: async (key) => {
        return rpcClient.call("cache", "get", [key]);
      },
      set: async (key, value, ttl) => {
        return rpcClient.call("cache", "set", [key, value, ttl]);
      },
      delete: async (key) => {
        return rpcClient.call("cache", "delete", [key]);
      },
      clear: async (pattern) => {
        return rpcClient.call("cache", "clear", [pattern]);
      }
    },
    // Storage service via RPC
    storage: {
      read: async (path4) => {
        return rpcClient.call("storage", "read", [path4]);
      },
      write: async (path4, data) => {
        return rpcClient.call("storage", "write", [path4, data]);
      },
      delete: async (path4) => {
        return rpcClient.call("storage", "delete", [path4]);
      },
      list: async (prefix) => {
        return rpcClient.call("storage", "list", [prefix]);
      },
      exists: async (path4) => {
        return rpcClient.call("storage", "exists", [path4]);
      }
    },
    // Analytics service via RPC
    analytics: {
      track: async (event, properties) => {
        return rpcClient.call("analytics", "track", [event, properties]);
      },
      identify: async (userId, traits) => {
        return rpcClient.call("analytics", "identify", [userId, traits]);
      },
      flush: async () => {
        return rpcClient.call("analytics", "flush", []);
      }
    }
  };
}

// src/sandbox/context-holder.ts
let globalContext = null;
function setGlobalContext(ctx) {
  globalContext = ctx;
}
function getGlobalContext() {
  return globalContext;
}
function clearGlobalContext() {
  globalContext = null;
}
function createFsProxy(fsShim) {
  const syncNotSupported = (method) => {
    throw new Error(
      `[SANDBOX] fs.${method}() sync API not supported.
Use async ctx.runtime.fs.${method.replace("Sync", "")}() instead.`
    );
  };
  const notSupported = (method) => {
    throw new Error(
      `[SANDBOX] fs.${method}() is not supported.
Use ctx.runtime.fs methods instead. Available methods:
  - readFile, writeFile, mkdir, readdir, stat, exists, rm, copy, move`
    );
  };
  return {
    // Promises API (primary supported API)
    promises: {
      readFile: async (path4, options) => {
        const encoding = typeof options === "string" ? options : options?.encoding || "utf-8";
        if (encoding === null || encoding === void 0) {
          return Buffer.from(await fsShim.readFileBuffer(path4));
        }
        return fsShim.readFile(path4, encoding);
      },
      writeFile: (path4, content, options) => {
        return fsShim.writeFile(path4, content, options);
      },
      appendFile: (path4, content, options) => {
        return fsShim.writeFile(path4, content, { ...options, append: true });
      },
      mkdir: (path4, options) => {
        return fsShim.mkdir(path4, options);
      },
      readdir: async (path4, options) => {
        if (options?.withFileTypes) {
          const entries = await fsShim.readdirWithStats(path4);
          return entries.map((entry) => ({
            name: entry.name,
            isFile: () => entry.isFile,
            isDirectory: () => entry.isDirectory,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isSymbolicLink: () => false,
            isFIFO: () => false,
            isSocket: () => false
          }));
        }
        return fsShim.readdir(path4);
      },
      stat: (path4) => {
        return fsShim.stat(path4);
      },
      lstat: (path4) => {
        return fsShim.stat(path4);
      },
      rm: (path4, options) => {
        return fsShim.rm(path4, options);
      },
      rmdir: (path4, options) => {
        return fsShim.rm(path4, { ...options, recursive: true });
      },
      unlink: (path4) => {
        return fsShim.rm(path4, { force: false });
      },
      copyFile: async (src, dest) => {
        return fsShim.copy(src, dest);
      },
      rename: (src, dest) => {
        return fsShim.move(src, dest);
      },
      access: async (path4) => {
        const exists = await fsShim.exists(path4);
        if (!exists) {
          const err = new Error(`ENOENT: no such file or directory, access '${path4}'`);
          err.code = "ENOENT";
          err.errno = -2;
          err.syscall = "access";
          err.path = path4;
          throw err;
        }
      },
      realpath: (path4) => {
        return Promise.resolve(fsShim.resolve(path4));
      },
      // Block unsupported async methods
      chmod: () => notSupported("promises.chmod"),
      chown: () => notSupported("promises.chown"),
      link: () => notSupported("promises.link"),
      symlink: () => notSupported("promises.symlink"),
      readlink: () => notSupported("promises.readlink"),
      truncate: () => notSupported("promises.truncate"),
      ftruncate: () => notSupported("promises.ftruncate"),
      utimes: () => notSupported("promises.utimes"),
      open: () => notSupported("promises.open")
    },
    // Callback API - emulate via promises (for legacy library compatibility)
    readFile: (path4, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = "utf-8";
      }
      const encoding = typeof options === "string" ? options : options?.encoding || "utf-8";
      fsShim.readFile(path4, encoding).then((data) => callback?.(null, data)).catch((err) => callback?.(err, null));
    },
    writeFile: (path4, content, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      fsShim.writeFile(path4, content, options).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    appendFile: (path4, content, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      fsShim.writeFile(path4, content, { ...options, append: true }).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    mkdir: (path4, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      fsShim.mkdir(path4, options).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    readdir: (path4, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      fsShim.readdir(path4).then((files) => callback?.(null, files)).catch((err) => callback?.(err, null));
    },
    stat: (path4, callback) => {
      fsShim.stat(path4).then((stats) => callback?.(null, stats)).catch((err) => callback?.(err, null));
    },
    lstat: (path4, callback) => {
      fsShim.stat(path4).then((stats) => callback?.(null, stats)).catch((err) => callback?.(err, null));
    },
    rm: (path4, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      fsShim.rm(path4, options).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    rmdir: (path4, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      fsShim.rm(path4, { ...options, recursive: true }).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    unlink: (path4, callback) => {
      fsShim.rm(path4, { force: false }).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    copyFile: (src, dest, callback) => {
      fsShim.copy(src, dest).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    rename: (src, dest, callback) => {
      fsShim.move(src, dest).then(() => callback?.(null)).catch((err) => callback?.(err));
    },
    access: (path4, mode, callback) => {
      if (typeof mode === "function") {
        callback = mode;
      }
      fsShim.exists(path4).then((exists) => {
        if (!exists) {
          const err = new Error(`ENOENT: no such file or directory, access '${path4}'`);
          err.code = "ENOENT";
          callback?.(err);
        } else {
          callback?.(null);
        }
      }).catch((err) => callback?.(err));
    },
    // Sync API - not supported
    readFileSync: () => syncNotSupported("readFileSync"),
    writeFileSync: () => syncNotSupported("writeFileSync"),
    appendFileSync: () => syncNotSupported("appendFileSync"),
    mkdirSync: () => syncNotSupported("mkdirSync"),
    readdirSync: () => syncNotSupported("readdirSync"),
    statSync: () => syncNotSupported("statSync"),
    lstatSync: () => syncNotSupported("lstatSync"),
    existsSync: () => syncNotSupported("existsSync"),
    rmSync: () => syncNotSupported("rmSync"),
    rmdirSync: () => syncNotSupported("rmdirSync"),
    unlinkSync: () => syncNotSupported("unlinkSync"),
    copyFileSync: () => syncNotSupported("copyFileSync"),
    renameSync: () => syncNotSupported("renameSync"),
    accessSync: () => syncNotSupported("accessSync"),
    realpathSync: () => syncNotSupported("realpathSync"),
    // Watch APIs - not supported
    watch: () => notSupported("watch"),
    watchFile: () => notSupported("watchFile"),
    unwatchFile: () => notSupported("unwatchFile"),
    // Stream APIs - not supported (use promises instead)
    createReadStream: () => notSupported("createReadStream"),
    createWriteStream: () => notSupported("createWriteStream"),
    // Constants (pass through from real fs)
    constants: {
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
      // File mode constants
      S_IFMT: 61440,
      S_IFREG: 32768,
      S_IFDIR: 16384,
      S_IFCHR: 8192,
      S_IFBLK: 24576,
      S_IFIFO: 4096,
      S_IFLNK: 40960,
      S_IFSOCK: 49152,
      // File permissions
      S_IRWXU: 448,
      S_IRUSR: 256,
      S_IWUSR: 128,
      S_IXUSR: 64,
      S_IRWXG: 56,
      S_IRGRP: 32,
      S_IWGRP: 16,
      S_IXGRP: 8,
      S_IRWXO: 7,
      S_IROTH: 4,
      S_IWOTH: 2,
      S_IXOTH: 1
    }
  };
}
function createHttpProxy(fetchShim, protocol) {
  const notSupported = (method) => {
    throw new Error(
      `[SANDBOX] ${protocol}.${method}() is not supported.
Use ctx.runtime.fetch() instead for full control.`
    );
  };
  class FakeIncomingMessage {
    statusCode;
    statusMessage;
    headers;
    httpVersion = "1.1";
    httpVersionMajor = 1;
    httpVersionMinor = 1;
    _body;
    _dataEmitted = false;
    constructor(response, body) {
      this.statusCode = response.status;
      this.statusMessage = response.statusText;
      this.headers = {};
      response.headers.forEach((value, key) => {
        this.headers[key] = value;
      });
      this._body = body;
    }
    on(event, handler) {
      if (event === "data" && !this._dataEmitted) {
        this._dataEmitted = true;
        setImmediate(() => handler(Buffer.from(this._body)));
      } else if (event === "end") {
        setImmediate(() => handler());
      } else {;}
      return this;
    }
    once(event, handler) {
      return this.on(event, handler);
    }
    setEncoding(_encoding) {
      return this;
    }
    pipe(_destination) {
      throw new Error("[SANDBOX] http.IncomingMessage.pipe() not supported. Use fetch() instead.");
    }
  }
  class FakeClientRequest {
    _headers = {};
    _body = "";
    _callback;
    setHeader(name, value) {
      this._headers[name] = value;
      return this;
    }
    getHeader(name) {
      return this._headers[name];
    }
    removeHeader(name) {
      delete this._headers[name];
      return this;
    }
    write(chunk) {
      this._body += chunk.toString();
      return true;
    }
    end(callback) {
      if (callback) {this._callback = callback;}
      if (this._callback) {
        this._callback();
      }
      return this;
    }
    on(_event, _handler) {
      return this;
    }
    once(event, handler) {
      return this.on(event, handler);
    }
    abort() {
    }
  }
  return {
    // http.get() / https.get()
    get: (url, options, callback) => {
      console.warn(
        `\u26A0\uFE0F  [DEPRECATED] Direct ${protocol}.get(). Use ctx.runtime.fetch() instead.`
      );
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const urlStr = typeof url === "string" ? url : url.toString();
      const headers = {};
      if (options?.headers) {
        Object.assign(headers, options.headers);
      }
      fetchShim(urlStr, { method: "GET", headers }).then(async (response) => {
        const body = await response.text();
        const fakeResponse = new FakeIncomingMessage(response, body);
        if (callback) {callback(fakeResponse);}
      }).catch((err) => {
        console.error(`[SANDBOX] ${protocol}.get() failed:`, err);
        if (callback) {
          const fakeError = new Error(err.message);
          fakeError.code = "ECONNREFUSED";
          callback(fakeError);
        }
      });
      return new FakeClientRequest();
    },
    // http.request() / https.request()
    request: (url, options, callback) => {
      console.warn(
        `\u26A0\uFE0F  [DEPRECATED] Direct ${protocol}.request(). Use ctx.runtime.fetch() instead.`
      );
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const urlStr = typeof url === "string" ? url : url.toString();
      const method = options?.method || "GET";
      const headers = {};
      if (options?.headers) {
        Object.assign(headers, options.headers);
      }
      const req = new FakeClientRequest();
      const originalEnd = req.end.bind(req);
      req.end = function(callback2) {
        fetchShim(urlStr, { method, headers, body: req._body || void 0 }).then(async (response) => {
          const body = await response.text();
          const fakeResponse = new FakeIncomingMessage(response, body);
          if (callback2) {callback2(fakeResponse);}
        }).catch((err) => {
          console.error(`[SANDBOX] ${protocol}.request() failed:`, err);
          if (callback2) {
            const fakeError = new Error(err.message);
            fakeError.code = "ECONNREFUSED";
            callback2(fakeError);
          }
        });
        if (callback2) {originalEnd(callback2);}
        return this;
      };
      if (callback) {
        req._callback = callback;
      }
      return req;
    },
    // Agent class (not supported)
    Agent: class FakeAgent {
      constructor() {
        throw new Error(`[SANDBOX] ${protocol}.Agent not supported. Use fetch() instead.`);
      }
    },
    globalAgent: {
      // Fake agent for libraries that check for it
      maxSockets: 5,
      maxFreeSockets: 2
    },
    // Server APIs - not supported
    createServer: () => notSupported("createServer"),
    Server: class FakeServer {
      constructor() {
        throw new Error(`[SANDBOX] ${protocol}.Server not supported. Plugins cannot create servers.`);
      }
    },
    // Constants
    METHODS: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    STATUS_CODES: {
      200: "OK",
      201: "Created",
      204: "No Content",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error"
    },
    // Not supported methods
    validateHeaderName: () => notSupported("validateHeaderName"),
    validateHeaderValue: () => notSupported("validateHeaderValue"),
    setMaxIdleHTTPParsers: () => notSupported("setMaxIdleHTTPParsers")
  };
}
function createChildProcessProxy(shellAPI) {
  const notSupported = (method) => {
    throw new Error(
      `[SANDBOX] child_process.${method}() is not supported.
Use ctx.platform.shell.exec() instead.
Example: await ctx.platform.shell.exec('git', ['status'])`
    );
  };
  const syncNotSupported = (method) => {
    throw new Error(
      `[SANDBOX] child_process.${method}() sync API not supported.
Use async ctx.platform.shell.exec() instead.`
    );
  };
  class FakeChildProcess extends EventEmitter {
    stdin = null;
    stdout = null;
    stderr = null;
    pid = Math.floor(Math.random() * 1e5);
    exitCode = null;
    signalCode = null;
    killed = false;
    constructor() {
      super();
    }
    kill(_signal) {
      this.killed = true;
      this.exitCode = 1;
      this.signalCode = "SIGTERM";
      setImmediate(() => this.emit("exit", 1, "SIGTERM"));
      return true;
    }
    send(_message) {
      throw new Error("[SANDBOX] child_process IPC not supported");
    }
    disconnect() {
    }
    unref() {
    }
    ref() {
    }
  }
  return {
    /**
     * exec() - Execute command via shell
     *
     * Maps to ctx.platform.shell.exec()
     */
    exec: (command, options, callback) => {
      console.warn(
        `\u26A0\uFE0F  [DEPRECATED] Direct child_process.exec(). Use ctx.platform.shell.exec() instead.`
      );
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const cwd = options?.cwd;
      const env = options?.env;
      const timeout = options?.timeout;
      const parts = command.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        if (callback) {
          callback(new Error("Empty command"), "", "");
        }
        return new FakeChildProcess();
      }
      const program = parts[0];
      const args = parts.slice(1);
      shellAPI.exec(program, args, { cwd, env, timeout, throwOnError: false }).then((result) => {
        if (callback) {
          const error = result.ok ? null : new Error(`Command failed with exit code ${result.code}`);
          callback(error, result.stdout, result.stderr);
        }
      }).catch((err) => {
        if (callback) {
          callback(err, "", "");
        }
      });
      return new FakeChildProcess();
    },
    /**
     * spawn() - Spawn process
     *
     * Limited emulation via shell.exec()
     */
    spawn: (command, args, options) => {
      console.warn(
        `\u26A0\uFE0F  [DEPRECATED] Direct child_process.spawn(). Use ctx.platform.shell.exec() instead.`
      );
      const cwd = options?.cwd;
      const env = options?.env;
      const timeout = options?.timeout;
      const proc = new FakeChildProcess();
      shellAPI.exec(command, args || [], { cwd, env, timeout, throwOnError: false }).then((result) => {
        proc.exitCode = result.code;
        proc.emit("exit", result.code, null);
        proc.emit("close", result.code, null);
      }).catch((err) => {
        proc.exitCode = 1;
        proc.emit("error", err);
        proc.emit("exit", 1, null);
      });
      return proc;
    },
    /**
     * execFile() - Execute file
     *
     * Maps to shell.exec()
     */
    execFile: (file, args, options, callback) => {
      console.warn(
        `\u26A0\uFE0F  [DEPRECATED] Direct child_process.execFile(). Use ctx.platform.shell.exec() instead.`
      );
      if (typeof args === "function") {
        callback = args;
        args = [];
        options = {};
      } else if (typeof options === "function") {
        callback = options;
        options = {};
      }
      const cwd = options?.cwd;
      const env = options?.env;
      const timeout = options?.timeout;
      shellAPI.exec(file, args || [], { cwd, env, timeout, throwOnError: false }).then((result) => {
        if (callback) {
          const error = result.ok ? null : new Error(`Command failed with exit code ${result.code}`);
          callback(error, result.stdout, result.stderr);
        }
      }).catch((err) => {
        if (callback) {
          callback(err, "", "");
        }
      });
      return new FakeChildProcess();
    },
    /**
     * fork() - Not supported (Node.js process forking not allowed)
     */
    fork: () => notSupported("fork"),
    /**
     * Sync methods - not supported
     */
    execSync: () => syncNotSupported("execSync"),
    execFileSync: () => syncNotSupported("execFileSync"),
    spawnSync: () => syncNotSupported("spawnSync"),
    /**
     * ChildProcess class
     */
    ChildProcess: FakeChildProcess
  };
}

// src/sandbox/harden.ts
const originals = /* @__PURE__ */ new Map();
function applySandboxPatches(options) {
  const { permissions, mode = "enforce", onViolation } = options;
  const restoreFns = [];
  const shouldShowTrace = (() => {
    const traceEnv = process.env.KB_SANDBOX_TRACE;
    if (traceEnv === "1") {return true;}
    if (traceEnv === "0") {return false;}
    return mode === "enforce";
  })();
  const emitViolation = (event) => {
    const emoji = event.decision === "block" ? "\u{1F6AB}" : "\u26A0\uFE0F";
    const prefix = mode === "enforce" ? "[SANDBOX BLOCK]" : "[SANDBOX WARN]";
    console.error(`${emoji} ${prefix} ${event.kind}: ${event.message}`);
    if (shouldShowTrace) {
      const stack = new Error().stack;
      if (stack) {
        const stackLines = stack.split("\n").slice(3, 8);
        console.error("\n\u{1F4CD} Violation location:");
        stackLines.forEach((line) => console.error(`  ${line.trim()}`));
        console.error("");
      }
    }
    onViolation?.(event);
  };
  restoreFns.push(patchRequire(permissions, mode, emitViolation));
  restoreFns.push(patchFetch(permissions, mode, emitViolation));
  restoreFns.push(patchProcessEnv(permissions));
  restoreFns.push(patchProcessExit(permissions, mode, emitViolation));
  restoreFns.push(patchProcessChdir(permissions, mode, emitViolation));
  return () => {
    for (const restore of restoreFns) {
      restore();
    }
    originals.clear();
  };
}
function patchRequire(permissions, mode, emitViolation) {
  const BLOCKED_MODULES = [
    "cluster",
    "node:cluster",
    "dgram",
    "node:dgram",
    "dns",
    "node:dns",
    "net",
    "node:net",
    "tls",
    "node:tls",
    "vm",
    "node:vm",
    "worker_threads",
    "node:worker_threads"
  ];
  const FS_MODULES = ["fs", "node:fs", "fs/promises", "node:fs/promises"];
  const HTTP_MODULES = ["http", "node:http", "https", "node:https"];
  const CHILD_PROCESS_MODULES = ["child_process", "node:child_process"];
  const require2 = createRequire(import.meta.url);
  const Module = require2("module");
  const originalRequire = Module.prototype.require;
  if (!originals.has("require")) {
    originals.set("require", originalRequire);
  }
  Module.prototype.require = function(id) {
    if (BLOCKED_MODULES.includes(id)) {
      let alternative = "If you need this functionality, request it via ctx.platform APIs.";
      if (id.includes("dns")) {
        alternative = "Network DNS is blocked for security. Use fetch() with hostname instead.";
      } else if (id.includes("vm") || id.includes("worker_threads")) {
        alternative = "Code execution/isolation is not allowed in plugins.";
      } else if (id.includes("net") || id.includes("tls")) {
        alternative = "Low-level network access is blocked. Use ctx.runtime.fetch() instead.";
      }
      const message = `Module "${id}" is blocked for security.
${alternative}`;
      emitViolation({
        kind: "module",
        target: id,
        decision: "block",
        message
      });
      if (mode === "enforce" || mode === "compat") {
        throw new Error(`[SANDBOX] ${message}`);
      }
    }
    if (FS_MODULES.includes(id)) {
      const ctx = getGlobalContext();
      if (mode === "compat" && ctx) {
        console.warn("\u26A0\uFE0F  [DEPRECATED] Direct fs access detected. Proxying to ctx.runtime.fs");
        console.warn("   Migrate to: await ctx.runtime.fs.readFile(path)");
        console.warn("   Set KB_SANDBOX_MODE=enforce to block this in future");
        return createFsProxy(ctx.runtime.fs);
      } else if (mode === "warn") {
        console.warn("\u26A0\uFE0F  [WARN] Direct fs access detected in module:", id);
        return originalRequire.apply(this, arguments);
      } else {
        const message = `Direct fs access is blocked. Use ctx.runtime.fs instead.
Example: await ctx.runtime.fs.readFile(path)
Docs: https://docs.kb-labs.dev/plugins/filesystem`;
        emitViolation({
          kind: "fs",
          target: id,
          decision: "block",
          message
        });
        throw new Error(`[SANDBOX] ${message}`);
      }
    }
    if (HTTP_MODULES.includes(id)) {
      const ctx = getGlobalContext();
      const protocol = id.includes("https") ? "https" : "http";
      if (mode === "compat" && ctx) {
        console.warn(`\u26A0\uFE0F  [DEPRECATED] Direct ${protocol} access detected. Proxying to ctx.runtime.fetch`);
        console.warn("   Migrate to: await ctx.runtime.fetch(url)");
        console.warn("   Set KB_SANDBOX_MODE=enforce to block this in future");
        return createHttpProxy(ctx.runtime.fetch, protocol);
      } else if (mode === "warn") {
        console.warn(`\u26A0\uFE0F  [WARN] Direct ${protocol} access detected in module:`, id);
        return originalRequire.apply(this, arguments);
      } else {
        const message = `Direct ${protocol} access is blocked. Use ctx.runtime.fetch() instead.`;
        emitViolation({
          kind: "module",
          target: id,
          decision: "block",
          message
        });
        throw new Error(`[SANDBOX] ${message}`);
      }
    }
    if (CHILD_PROCESS_MODULES.includes(id)) {
      const ctx = getGlobalContext();
      if (mode === "compat" && ctx && ctx.api?.shell) {
        console.warn("\u26A0\uFE0F  [DEPRECATED] Direct child_process access detected. Proxying to ctx.api.shell");
        console.warn("   Migrate to: await ctx.api.shell.exec(command, args)");
        console.warn("   Set KB_SANDBOX_MODE=enforce to block this in future");
        return createChildProcessProxy(ctx.api.shell);
      } else if (mode === "warn") {
        console.warn("\u26A0\uFE0F  [WARN] Direct child_process access detected in module:", id);
        return originalRequire.apply(this, arguments);
      } else {
        const message = `Direct child_process access is blocked. Use ctx.api.shell instead.
Example: await ctx.api.shell.exec('git', ['status'])
Docs: https://docs.kb-labs.dev/plugins/shell`;
        emitViolation({
          kind: "module",
          target: id,
          decision: "block",
          message
        });
        throw new Error(`[SANDBOX] ${message}`);
      }
    }
    return originalRequire.apply(this, arguments);
  };
  return () => {
    Module.prototype.require = originalRequire;
  };
}
function patchFetch(permissions, mode, emitViolation) {
  const originalFetch = globalThis.fetch;
  if (!originalFetch) {
    return () => {
    };
  }
  if (!originals.has("fetch")) {
    originals.set("fetch", originalFetch);
  }
  globalThis.fetch = async function sandboxedFetch(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const urlObj = new URL(url);
    const allowedPatterns = permissions?.network?.fetch ?? [];
    if (allowedPatterns.length === 0) {
      const message = `Network access is blocked. Add "network.fetch" permission to manifest.
Tried to fetch: ${url}`;
      emitViolation({
        kind: "fetch",
        target: urlObj.hostname,
        decision: "block",
        message
      });
      if (mode === "enforce") {
        throw new Error(`[SANDBOX] ${message}`);
      }
    } else {
      const allowed = allowedPatterns.some((pattern) => {
        if (pattern === "*") {return true;}
        if (pattern.startsWith("*.")) {
          return urlObj.hostname.endsWith(pattern.slice(1));
        }
        if (pattern.includes("://")) {
          return url.startsWith(pattern) || url.includes(pattern);
        }
        return urlObj.hostname === pattern || urlObj.hostname.endsWith("." + pattern);
      });
      if (!allowed) {
        const message = `Fetch to "${urlObj.hostname}" is not allowed.
Allowed patterns: ${allowedPatterns.join(", ")}
Add to manifest: permissions.network.fetch`;
        emitViolation({
          kind: "fetch",
          target: urlObj.hostname,
          decision: "block",
          message
        });
        if (mode === "enforce") {
          throw new Error(`[SANDBOX] ${message}`);
        }
      }
    }
    return originalFetch(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}
function patchProcessEnv(permissions, mode, emitViolation) {
  const originalEnv = process.env;
  const allowedEnvKeys = permissions?.env?.read ?? [];
  if (!originals.has("env")) {
    originals.set("env", originalEnv);
  }
  Object.defineProperty(process, "env", {
    get() {
      const filtered = {};
      for (const key of allowedEnvKeys) {
        if (key.endsWith("*")) {
          const prefix = key.slice(0, -1);
          for (const [envKey, value] of Object.entries(originalEnv)) {
            if (envKey.startsWith(prefix)) {
              filtered[envKey] = value;
            }
          }
        } else {
          filtered[key] = originalEnv[key];
        }
      }
      return filtered;
    },
    configurable: true,
    // Allow restoration
    enumerable: true
  });
  return () => {
    Object.defineProperty(process, "env", {
      value: originalEnv,
      configurable: true,
      enumerable: true,
      writable: false
    });
  };
}
function patchProcessExit(permissions, mode, emitViolation) {
  const originalExit = process.exit;
  if (!originals.has("exit")) {
    originals.set("exit", originalExit);
  }
  process.exit = function sandboxedExit(code) {
    const message = `process.exit() is blocked. Return from handler instead.
Use: return { exitCode: ${code ?? 0} }`;
    emitViolation({
      kind: "exit",
      target: `exit(${code ?? 0})`,
      decision: "block",
      message
    });
    if (mode === "enforce") {
      throw new Error(`[SANDBOX] ${message}`);
    }
  };
  return () => {
    process.exit = originalExit;
  };
}
function patchProcessChdir(permissions, mode, emitViolation) {
  const originalChdir = process.chdir;
  if (!originals.has("chdir")) {
    originals.set("chdir", originalChdir);
  }
  process.chdir = function sandboxedChdir(directory) {
    const message = `process.chdir() is blocked. Working directory changes are not allowed.
Current directory is locked to: ${process.cwd()}`;
    emitViolation({
      kind: "exit",
      // Reuse 'exit' kind for process control
      target: `chdir(${directory})`,
      decision: "block",
      message
    });
    if (mode === "enforce") {
      throw new Error(`[SANDBOX] ${message}`);
    }
  };
  return () => {
    process.chdir = originalChdir;
  };
}

// src/sandbox/bootstrap.ts
let platformReady;
platformReady = (async () => {
  try {
    const rawConfigJson = process.env.KB_RAW_CONFIG_JSON;
    if (rawConfigJson) {
      const rawConfig = JSON.parse(rawConfigJson);
      const platformConfig = rawConfig.platform;
      if (platformConfig) {
        await initPlatform(platformConfig, process.cwd());
      }
    }
  } catch (error) {
    console.error("[bootstrap] Failed to initialize platform in child process:", error);
  }
})();
function createStdoutUI() {
  return {
    // Colors API from shared-cli-ui
    colors: safeColors,
    // Symbols API from shared-cli-ui
    symbols: safeSymbols,
    // Write text with newline
    write: (text) => {
      process.stdout.write(text + "\n");
    },
    info: (msg, options) => {
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || "Info",
          sections: options.sections,
          status: "info",
          timing: options.timing
        });
        console.log(boxOutput);
      } else {
        console.log(msg);
      }
    },
    success: (msg, options) => {
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || "Success",
          sections: options.sections,
          status: "success",
          timing: options.timing
        });
        console.log(boxOutput);
      } else {
        console.log(`\u2713 ${msg}`);
      }
    },
    warn: (msg, options) => {
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || "Warning",
          sections: options.sections,
          status: "warning",
          timing: options.timing
        });
        console.log(boxOutput);
      } else {
        console.warn(`\u26A0 ${msg}`);
      }
    },
    error: (err, options) => {
      const message = err instanceof Error ? err.message : err;
      if (options?.sections && options.sections.length > 0) {
        const boxOutput = sideBorderBox({
          title: options.title || "Error",
          sections: options.sections,
          status: "error",
          timing: options.timing
        });
        console.error(boxOutput);
      } else {
        console.error(message);
      }
    },
    debug: (msg) => {
      if (process.env.DEBUG) {console.debug(msg);}
    },
    spinner: (msg) => {
      console.log(`\u27F3 ${msg}`);
      return {
        update: (m) => console.log(`\u27F3 ${m}`),
        succeed: (m) => console.log(`\u2713 ${m ?? msg}`),
        fail: (m) => console.log(`\u2717 ${m ?? msg}`),
        stop: () => {
        }
      };
    },
    table: (data) => console.table(data),
    json: (data) => console.log(JSON.stringify(data, null, 2)),
    newline: () => console.log(),
    divider: () => console.log("\u2500".repeat(40)),
    box: (content, title) => {
      if (title) {console.log(`\u250C\u2500 ${title} \u2500\u2510`);}
      console.log(content);
      if (title) {console.log(`\u2514${"\u2500".repeat(title.length + 4)}\u2518`);}
    },
    sideBox: (options) => {
      if (options.title) {console.log(`\u250C\u2500 ${options.title} \u2500\u2510`);}
      if (options.sections) {
        for (const section of options.sections) {
          if (section.header) {console.log(`
${section.header}`);}
          for (const item of section.items) {
            console.log(`  ${item}`);
          }
        }
      }
      if (options.title) {console.log(`\u2514${"\u2500".repeat(options.title.length + 4)}\u2518`);}
    },
    confirm: async () => true,
    prompt: async () => ""
  };
}
const abortController = new AbortController();
process.on("message", async (msg) => {
  if (msg.type === "abort") {
    abortController.abort();
    return;
  }
  if (msg.type !== "execute") {return;}
  const executeMsg = msg;
  const { descriptor, handlerPath, input, socketPath } = executeMsg;
  const sandboxMode = process.env.KB_SANDBOX_MODE || "enforce";
  const restoreSandbox = applySandboxPatches({
    permissions: descriptor.permissions,
    mode: sandboxMode
    // Read from KB_SANDBOX_MODE env var
  });
  await platformReady;
  const platform = await connectToPlatform(socketPath);
  const ui = createStdoutUI();
  const { context, cleanupStack } = createPluginContextV3({
    descriptor,
    platform,
    ui,
    signal: abortController.signal
  });
  setGlobalContext(context);
  try {
    const handlerModule = await import(handlerPath);
    const handler = handlerModule.default ?? handlerModule;
    if (typeof handler.execute !== "function") {
      throw new PluginError(
        `Handler at ${handlerPath} does not export an execute function`,
        "INVALID_HANDLER"
      );
    }
    let finalInput = input;
    if (input.flags && typeof input.flags === "object") {
      finalInput = { ...input, ...input.flags };
    }
    const handlerResult = await handler.execute(context, finalInput);
    const resultMsg = {
      type: "result",
      exitCode: handlerResult?.exitCode ?? 0,
      result: handlerResult ? "result" in handlerResult ? handlerResult.result : void 0 : void 0,
      meta: handlerResult ? "meta" in handlerResult ? handlerResult.meta : void 0 : void 0
    };
    process.send?.(resultMsg);
  } catch (error) {
    const pluginError = wrapError(error);
    const errorMsg = {
      type: "error",
      error: pluginError.toJSON()
    };
    process.send?.(errorMsg);
  } finally {
    clearGlobalContext();
    await executeCleanup(cleanupStack, platform.logger);
    restoreSandbox();
  }
});
const readyMsg = { type: "ready" };
process.send?.(readyMsg);
//# sourceMappingURL=bootstrap.js.map
//# sourceMappingURL=bootstrap.js.map