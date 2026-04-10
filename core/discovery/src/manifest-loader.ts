/**
 * @module @kb-labs/core-discovery/manifest-loader
 * Safe dynamic import of plugin manifests with timeout protection.
 */

import { isManifestV3, type ManifestV3 } from '@kb-labs/plugin-contracts';
import type { DiagnosticCollector } from './diagnostics.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const DEFAULT_IMPORT_TIMEOUT_MS = 5_000;

/**
 * Validate that a resolved path stays within the allowed root directory.
 * Prevents path traversal attacks via manifest fields like `"../../etc/passwd"`.
 */
function isWithinRoot(filePath: string, root: string): boolean {
  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(root);
  return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
}

/**
 * Safely import a module with a timeout guard.
 * Cleans up the timer on success to avoid resource leaks.
 */
async function safeImport<T = unknown>(
  modulePath: string,
  timeoutMs: number = DEFAULT_IMPORT_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Import timeout after ${timeoutMs}ms: ${modulePath}`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([
      import(modulePath) as Promise<T>,
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Attempt to locate and load a ManifestV3 from a package root directory.
 *
 * Resolution order:
 *   1. package.json `kbLabs.manifest` or `kb.manifest` field (relative path)
 *   2. `kb.plugin.json` in package root
 *   3. Manifest exported from package entry point (`dist/index.js`)
 */
export async function loadManifest(
  packageRoot: string,
  diag: DiagnosticCollector,
  timeoutMs: number = DEFAULT_IMPORT_TIMEOUT_MS,
): Promise<ManifestV3 | null> {
  const pluginId = path.basename(packageRoot);
  const resolvedRoot = path.resolve(packageRoot);

  // --- 1. Check package.json for manifest field ---
  const pkgJsonPath = path.join(resolvedRoot, 'package.json');
  try {
    const raw = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const manifestField =
      (pkg.kbLabs as Record<string, unknown> | undefined)?.manifest ??
      (pkg.kb as Record<string, unknown> | undefined)?.manifest;

    if (typeof manifestField === 'string') {
      const manifestPath = path.resolve(resolvedRoot, manifestField);

      // Path traversal guard
      if (!isWithinRoot(manifestPath, resolvedRoot)) {
        diag.error('MANIFEST_VALIDATION_ERROR',
          `Manifest path "${manifestField}" escapes package root — possible path traversal`, {
          pluginId,
          filePath: manifestPath,
          remediation: 'Use a relative path within the package directory',
        });
        return null;
      }

      return await importManifestFile(manifestPath, pluginId, diag, timeoutMs);
    }
  } catch {
    // package.json missing or unreadable — continue
  }

  // --- 2. Try kb.plugin.json ---
  const kbPluginJsonPath = path.join(resolvedRoot, 'kb.plugin.json');
  try {
    await fs.access(kbPluginJsonPath);
    const raw = await fs.readFile(kbPluginJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (isManifestV3(parsed)) {
      return parsed;
    }
    diag.warning('MANIFEST_VALIDATION_ERROR', `kb.plugin.json exists but is not a valid ManifestV3`, {
      pluginId,
      filePath: kbPluginJsonPath,
      remediation: 'Ensure the file has schema: "kb.plugin/3" and required fields (id, version)',
    });
    return null;
  } catch {
    // No kb.plugin.json — continue
  }

  // --- 3. Try dist/index.js (always within package root, no traversal risk) ---
  try {
    const entryPoint = path.join(resolvedRoot, 'dist', 'index.js');
    await fs.access(entryPoint);
    return await importManifestFile(entryPoint, pluginId, diag, timeoutMs);
  } catch {
    // No dist/index.js or import failed
  }

  diag.error('MANIFEST_NOT_FOUND', `No manifest found in ${resolvedRoot}`, {
    pluginId,
    filePath: resolvedRoot,
    remediation: 'Add a kb.plugin.json file or set kbLabs.manifest in package.json',
  });
  return null;
}

/**
 * Import a manifest from a specific file path.
 */
async function importManifestFile(
  filePath: string,
  pluginId: string,
  diag: DiagnosticCollector,
  timeoutMs: number,
): Promise<ManifestV3 | null> {
  try {
    const mod = await safeImport<Record<string, unknown>>(filePath, timeoutMs);
    const candidate = mod.manifest ?? mod.default ?? mod;

    if (isManifestV3(candidate)) {
      return candidate;
    }

    diag.warning('MANIFEST_VALIDATION_ERROR', `Imported module is not a valid ManifestV3`, {
      pluginId,
      filePath,
      remediation: 'Ensure the module exports a ManifestV3 object with schema: "kb.plugin/3"',
    });
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('Import timeout');

    diag.error(
      isTimeout ? 'MANIFEST_LOAD_TIMEOUT' : 'MANIFEST_PARSE_ERROR',
      `Failed to load manifest from ${filePath}: ${message}`,
      {
        pluginId,
        filePath,
        stack: err instanceof Error ? err.stack : undefined,
        remediation: isTimeout
          ? 'Check for circular dependencies or blocking top-level await in the module'
          : 'Ensure the manifest file is valid JavaScript/JSON',
      },
    );
    return null;
  }
}
