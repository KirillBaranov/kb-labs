/**
 * @module @kb-labs/core-config/api/effective-config
 *
 * Canonical "give me the effective raw config" entry point.
 *
 * Assembles the three configuration layers any KB Labs project may have
 * and returns the deep-merged result plus diagnostics about how it was
 * resolved:
 *
 *   1. `<platformRoot>/.kb/kb.config.*`  — platform baseline (installed
 *      mode only; absent in solo dev where projectRoot == platformRoot)
 *   2. `<projectRoot>/.kb/kb.config.*`   — project layer
 *   3. `<projectRoot>/.kb/overlays/*.jsonc`  — scenario overlays applied
 *      by `kb-dev ensure --scenario`, lex-sorted
 *
 * Each layer is deep-merged onto the previous via `mergeOverlay`. Overlays
 * are intentionally *project-only* — overlay files placed under the
 * platform root are ignored. Plugins that read their own section from the
 * raw config (gateway.*, mind.*, workflow.*, ...) should use this rather
 * than re-implementing the layering.
 *
 * Returns `null` only when none of the three layers contributed anything.
 *
 * This is complementary to `@kb-labs/core-runtime :: loadPlatformConfig`,
 * which produces the structured `PlatformConfig` view (adapters, core,
 * execution). Use `loadEffectiveConfig` when you need the full raw shape;
 * use `loadPlatformConfig` when you need platform initialisation.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { readJsonWithDiagnostics } from '../runtime/runtime.js';
import type { Diagnostic } from '../types/index.js';
import { loadOverlays } from '../overlay/loader.js';
import { mergeOverlay } from '../overlay/merge.js';

const CONFIG_CANDIDATES = [
  path.join('.kb', 'kb.config.jsonc'),
  path.join('.kb', 'kb.config.json'),
  'kb.config.jsonc',
  'kb.config.json',
] as const;

export interface EffectiveConfigResult {
  /** Deep-merged effective data (platform ← project ← overlays). */
  data: Record<string, unknown>;
  /** Absolute path to the platform-root config file, if one was loaded. */
  platformConfigPath?: string;
  /** Absolute path to the project-root config file, if one was loaded. */
  projectConfigPath?: string;
  /** Absolute paths of overlays applied, in merge order. */
  overlayPaths: string[];
  /** Non-fatal diagnostics (malformed files, layer rejected, etc). */
  diagnostics: Diagnostic[];
}

export interface LoadEffectiveConfigOptions {
  /**
   * Optional platform installation root. When provided and distinct from
   * `projectRoot`, its `kb.config.*` is read first and used as the
   * deep-merge baseline. Overlays are *not* read from this root.
   */
  platformRoot?: string;
}

async function findConfigInRoot(root: string): Promise<string | undefined> {
  for (const rel of CONFIG_CANDIDATES) {
    const full = path.join(root, rel);
    try {
      await fsp.access(full);
      return full;
    } catch {
      // continue
    }
  }
  return undefined;
}

async function readObjectAtRoot(
  root: string,
  diagnostics: Diagnostic[],
): Promise<{ path?: string; data: Record<string, unknown> }> {
  const configPath = await findConfigInRoot(root);
  if (!configPath) {
    return { data: {} };
  }
  const read = await readJsonWithDiagnostics<unknown>(configPath);
  diagnostics.push(...read.diagnostics);
  if (!read.ok) {
    return { data: {} };
  }
  const data = read.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    diagnostics.push({
      level: 'error',
      code: 'CONFIG_NOT_OBJECT',
      message: `Config must be a JSON object at top level: ${configPath}`,
    });
    return { path: configPath, data: {} };
  }
  return { path: configPath, data: data as Record<string, unknown> };
}

/**
 * Load the effective project config — deep-merged across platform → project
 * → project overlays. Returns `null` when nothing contributed.
 */
export async function loadEffectiveConfig(
  projectRoot: string,
  options: LoadEffectiveConfigOptions = {},
): Promise<EffectiveConfigResult | null> {
  const diagnostics: Diagnostic[] = [];

  const usePlatform =
    !!options.platformRoot && options.platformRoot !== projectRoot;

  const platformLayer = usePlatform
    ? await readObjectAtRoot(options.platformRoot!, diagnostics)
    : { data: {} as Record<string, unknown> };
  const projectLayer = await readObjectAtRoot(projectRoot, diagnostics);

  const overlayResult = await loadOverlays(projectRoot);
  diagnostics.push(...overlayResult.diagnostics);

  const nothingFound =
    !platformLayer.path &&
    !projectLayer.path &&
    overlayResult.overlays.length === 0;
  if (nothingFound) {
    return null;
  }

  let merged: Record<string, unknown> = mergeOverlay(
    platformLayer.data,
    projectLayer.data,
  );
  const overlayPaths: string[] = [];
  for (const overlay of overlayResult.overlays) {
    merged = mergeOverlay(merged, overlay.data);
    overlayPaths.push(overlay.path);
  }

  return {
    data: merged,
    platformConfigPath: platformLayer.path,
    projectConfigPath: projectLayer.path,
    overlayPaths,
    diagnostics,
  };
}
