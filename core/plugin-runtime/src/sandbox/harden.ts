/**
 * Sandbox hardening via monkey-patching
 *
 * NOTE: This is NOT 100% secure - a determined attacker can bypass.
 * For true isolation, use container mode (future).
 * This protects against accidental misuse and honest plugins.
 *
 * Key principles:
 * 1. Only patch in subprocess (child process)
 * 2. Make patches reversible (save originals)
 * 3. Start with egress (network) + loud logging
 * 4. Provide visibility via audit trail
 */

import type { PermissionSpec } from '@kb-labs/plugin-contracts';
import { createRequire } from 'node:module';

export type SandboxMode = 'warn' | 'enforce' | 'compat';

export interface SandboxPatchOptions {
  permissions: PermissionSpec;
  mode?: SandboxMode;
  onViolation?: (event: SandboxViolationEvent) => void;
}

export interface SandboxViolationEvent {
  kind: 'module' | 'fetch' | 'env' | 'exit' | 'fs';
  target: string;
  decision: 'allow' | 'block';
  message: string;
}

interface PatchRestore {
  (): void;
}

// Store original functions for restoration
const originals = new Map<string, any>();

/**
 * Apply all sandbox patches
 *
 * Returns cleanup function to restore original behavior
 */
export function applySandboxPatches(options: SandboxPatchOptions): PatchRestore {
  const { permissions, mode = 'enforce', onViolation } = options;

  const restoreFns: PatchRestore[] = [];

  // Determine if stack trace should be shown
  // KB_SANDBOX_TRACE=1 - force enable
  // KB_SANDBOX_TRACE=0 - force disable
  // Default: enabled for 'enforce', disabled for 'compat'/'warn'
  const shouldShowTrace = (() => {
    const traceEnv = process.env.KB_SANDBOX_TRACE;
    if (traceEnv === '1') {return true;}
    if (traceEnv === '0') {return false;}
    return mode === 'enforce'; // Default: trace only in enforce mode
  })();

  // Helper to emit violation events
  const emitViolation = (event: SandboxViolationEvent) => {
    // Log to stderr (visible even if stdout captured)
    const emoji = event.decision === 'block' ? '🚫' : '⚠️';
    const prefix = mode === 'enforce' ? '[SANDBOX BLOCK]' : '[SANDBOX WARN]';
    console.error(`${emoji} ${prefix} ${event.kind}: ${event.message}`);

    // Show stack trace to help locate the violation (if enabled)
    if (shouldShowTrace) {
      const stack = new Error().stack;
      if (stack) {
        // Skip first 3 lines (Error, emitViolation, patchXXX function)
        const stackLines = stack.split('\n').slice(3, 8); // Show top 5 frames
        console.error('\n📍 Violation location:');
        stackLines.forEach(line => console.error(`  ${line.trim()}`));
        console.error('');
      }
    }

    // Call custom handler if provided
    onViolation?.(event);
  };

  // 1. Patch require() to block dangerous modules
  restoreFns.push(patchRequire(permissions, mode, emitViolation));

  // 2. Patch fetch() for network access control (EGRESS)
  restoreFns.push(patchFetch(permissions, mode, emitViolation));

  // 3. Patch process.env (filter by permissions)
  restoreFns.push(patchProcessEnv(permissions, mode, emitViolation));

  // 4. Patch process.exit() (prevent killing CLI)
  restoreFns.push(patchProcessExit(permissions, mode, emitViolation));

  // 5. Patch process.chdir() (prevent directory escape)
  restoreFns.push(patchProcessChdir(permissions, mode, emitViolation));

  // Return cleanup function
  return () => {
    for (const restore of restoreFns) {
      restore();
    }
    originals.clear();
  };
}

/**
 * Patch Module.prototype.require to block dangerous modules
 */
function patchRequire(
  permissions: PermissionSpec,
  mode: SandboxMode,
  emitViolation: (event: SandboxViolationEvent) => void
): PatchRestore {
  const BLOCKED_MODULES = [
    'cluster',
    'node:cluster',
    'dgram',
    'node:dgram',
    'dns',
    'node:dns',
    'net',
    'node:net',
    'tls',
    'node:tls',
    'vm',
    'node:vm',
    'worker_threads',
    'node:worker_threads',
  ];

  const FS_MODULES = ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'];
  const HTTP_MODULES = ['http', 'node:http', 'https', 'node:https'];
  const CHILD_PROCESS_MODULES = ['child_process', 'node:child_process'];

  // Use createRequire for ESM compatibility
  const require = createRequire(import.meta.url);
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  if (!originals.has('require')) {
    originals.set('require', originalRequire);
  }

  function getBlockedModuleAlternative(id: string): string {
    if (id.includes('dns')) {
      return 'Network DNS is blocked for security. Use fetch() with hostname instead.';
    }
    if (id.includes('vm') || id.includes('worker_threads')) {
      return 'Code execution/isolation is not allowed in plugins.';
    }
    if (id.includes('net') || id.includes('tls')) {
      return 'Low-level network access is blocked. Use ctx.runtime.fetch() instead.';
    }
    return 'If you need this functionality, request it via ctx.platform APIs.';
  }

  Module.prototype.require = function (id: string) {
    // Check blocked modules (always strict - no proxying possible)
    if (BLOCKED_MODULES.includes(id)) {
      const message = `Module "${id}" is blocked for security.\n${getBlockedModuleAlternative(id)}`;
      emitViolation({ kind: 'module', target: id, decision: 'block', message });
      if (mode === 'enforce' || mode === 'compat') {
        throw new Error(`[SANDBOX] ${message}`);
      }
    }

    // Check direct fs access
    if (FS_MODULES.includes(id)) {
      if (mode === 'compat' || mode === 'warn') {
        console.warn('⚠️  [COMPAT] Direct fs access detected. Using native fs.');
        console.warn('   Migrate to: await ctx.runtime.fs.readFile(path)');
        console.warn('   Set KB_SANDBOX_MODE=enforce to block this in future');
        return originalRequire.call(this, id);
      }
      const message =
        `Direct fs access is blocked. Use ctx.runtime.fs instead.\n` +
        `Example: await ctx.runtime.fs.readFile(path)\n` +
        `Docs: https://docs.kb-labs.dev/plugins/filesystem`;
      emitViolation({ kind: 'fs', target: id, decision: 'block', message });
      throw new Error(`[SANDBOX] ${message}`);
    }

    // Check direct http/https access
    if (HTTP_MODULES.includes(id)) {
      const protocol = id.includes('https') ? 'https' : 'http';
      if (mode === 'compat' || mode === 'warn') {
        console.warn(`⚠️  [COMPAT] Direct ${protocol} access detected. Using native ${protocol}.`);
        console.warn('   Migrate to: await ctx.runtime.fetch(url)');
        console.warn('   Set KB_SANDBOX_MODE=enforce to block this in future');
        return originalRequire.call(this, id);
      }
      const message = `Direct ${protocol} access is blocked. Use ctx.runtime.fetch() instead.`;
      emitViolation({ kind: 'module', target: id, decision: 'block', message });
      throw new Error(`[SANDBOX] ${message}`);
    }

    // Check direct child_process access
    if (CHILD_PROCESS_MODULES.includes(id)) {
      if (mode === 'compat' || mode === 'warn') {
        console.warn('⚠️  [COMPAT] Direct child_process access detected. Using native child_process.');
        console.warn('   Migrate to: await ctx.api.shell.exec(command, args)');
        console.warn('   Set KB_SANDBOX_MODE=enforce to block this in future');
        return originalRequire.call(this, id);
      }
      const message =
        `Direct child_process access is blocked. Use ctx.api.shell instead.\n` +
        `Example: await ctx.api.shell.exec('git', ['status'])\n` +
        `Docs: https://docs.kb-labs.dev/plugins/shell`;
      emitViolation({ kind: 'module', target: id, decision: 'block', message });
      throw new Error(`[SANDBOX] ${message}`);
    }

    return originalRequire.call(this, id);
  };

  // Return restore function
  return () => {
    Module.prototype.require = originalRequire;
  };
}

/**
 * Patch globalThis.fetch for network egress control
 */
function patchFetch(
  permissions: PermissionSpec,
  mode: SandboxMode,
  emitViolation: (event: SandboxViolationEvent) => void
): PatchRestore {
  const originalFetch = globalThis.fetch;

  if (!originalFetch) {
    // fetch not available, nothing to patch
    return () => {};
  }

  if (!originals.has('fetch')) {
    originals.set('fetch', originalFetch);
  }

  globalThis.fetch = async function sandboxedFetch(
    input: string | URL | Request,
    init?: RequestInit
  ) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    const urlObj = new URL(url);

    // Check if network access is allowed
    const allowedPatterns = permissions?.network?.fetch ?? [];

    if (allowedPatterns.length === 0) {
      const message = `Network access is blocked. Add "network.fetch" permission to manifest.\nTried to fetch: ${url}`;

      emitViolation({
        kind: 'fetch',
        target: urlObj.hostname,
        decision: 'block',
        message,
      });

      if (mode === 'enforce') {
        throw new Error(`[SANDBOX] ${message}`);
      }
    } else {
      const allowed = allowedPatterns.some((pattern: string) => {
        if (pattern === '*') {return true;}
        // Simple pattern matching: 'api.github.com' or '*.github.com'
        if (pattern.startsWith('*.')) {
          return urlObj.hostname.endsWith(pattern.slice(1));
        }
        // Support full URL patterns
        if (pattern.includes('://')) {
          return url.startsWith(pattern) || url.includes(pattern);
        }
        // Hostname matching
        return (
          urlObj.hostname === pattern ||
          urlObj.hostname.endsWith('.' + pattern)
        );
      });

      if (!allowed) {
        const message =
          `Fetch to "${urlObj.hostname}" is not allowed.\n` +
          `Allowed patterns: ${allowedPatterns.join(', ')}\n` +
          `Add to manifest: permissions.network.fetch`;

        emitViolation({
          kind: 'fetch',
          target: urlObj.hostname,
          decision: 'block',
          message,
        });

        if (mode === 'enforce') {
          throw new Error(`[SANDBOX] ${message}`);
        }
      }
    }

    return originalFetch(input, init);
  } as typeof fetch;

  // Return restore function
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Patch process.env to filter environment variables
 */
function patchProcessEnv(
  permissions: PermissionSpec,
  _mode: SandboxMode,
  _emitViolation: (event: SandboxViolationEvent) => void
): PatchRestore {
  const originalEnv = process.env;
  const allowedEnvKeys = permissions?.env?.read ?? [];

  if (!originals.has('env')) {
    originals.set('env', originalEnv);
  }

  Object.defineProperty(process, 'env', {
    get() {
      // Return filtered env
      const filtered: Record<string, string | undefined> = {};

      for (const key of allowedEnvKeys) {
        if (key.endsWith('*')) {
          // Wildcard support: KB_* matches KB_FOO, KB_BAR
          const prefix = key.slice(0, -1);
          for (const [envKey, value] of Object.entries(originalEnv)) {
            if (envKey.startsWith(prefix)) {
              filtered[envKey] = value;
            }
          }
        } else {
          // Exact match
          filtered[key] = originalEnv[key];
        }
      }

      return filtered;
    },
    configurable: true, // Allow restoration
    enumerable: true,
  });

  // Return restore function
  return () => {
    Object.defineProperty(process, 'env', {
      value: originalEnv,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  };
}

/**
 * Patch process.exit() to prevent plugins from killing CLI
 */
function patchProcessExit(
  permissions: PermissionSpec,
  mode: SandboxMode,
  emitViolation: (event: SandboxViolationEvent) => void
): PatchRestore {
  const originalExit = process.exit;

  if (!originals.has('exit')) {
    originals.set('exit', originalExit);
  }

  process.exit = function sandboxedExit(code?: number) {
    const message =
      `process.exit() is blocked. Return from handler instead.\n` +
      `Use: return { exitCode: ${code ?? 0} }`;

    emitViolation({
      kind: 'exit',
      target: `exit(${code ?? 0})`,
      decision: 'block',
      message,
    });

    if (mode === 'enforce') {
      throw new Error(`[SANDBOX] ${message}`);
    }
  } as typeof process.exit;

  // Return restore function
  return () => {
    process.exit = originalExit;
  };
}

/**
 * Patch process.chdir() to prevent directory escape
 */
function patchProcessChdir(
  permissions: PermissionSpec,
  mode: SandboxMode,
  emitViolation: (event: SandboxViolationEvent) => void
): PatchRestore {
  const originalChdir = process.chdir;

  if (!originals.has('chdir')) {
    originals.set('chdir', originalChdir);
  }

  process.chdir = function sandboxedChdir(directory: string) {
    const message =
      `process.chdir() is blocked. Working directory changes are not allowed.\n` +
      `Current directory is locked to: ${process.cwd()}`;

    emitViolation({
      kind: 'exit', // Reuse 'exit' kind for process control
      target: `chdir(${directory})`,
      decision: 'block',
      message,
    });

    if (mode === 'enforce') {
      throw new Error(`[SANDBOX] ${message}`);
    }
  } as typeof process.chdir;

  // Return restore function
  return () => {
    process.chdir = originalChdir;
  };
}
