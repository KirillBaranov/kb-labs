/**
 * @module @kb-labs/core/config/overlay/merged-raw
 *
 * Overlay-aware raw config reader.
 *
 * Returns the effective raw config seen by a plugin reading its own section
 * directly (bypassing `loadPlatformConfig`). The three layers, deep-merged
 * with `mergeOverlay`:
 *
 *   1. `platformRoot/.kb/kb.config.*`  (optional baseline; installed mode)
 *   2. `projectRoot/.kb/kb.config.*`   (project layer)
 *   3. `projectRoot/.kb/overlays/*.jsonc`  (scenario overlays; lex-sorted)
 *
 * The layered merge lives here, in core-config, so that no plugin has to
 * re-implement platform↔project resolution alongside overlay handling.
 *
 * Returns `null` only when none of the three layers contributed anything.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { readJsonWithDiagnostics } from '../runtime/runtime.js';
import type { Diagnostic } from '../types/index.js';
import { loadOverlays } from './loader.js';
import { mergeOverlay } from './merge.js';

const CONFIG_CANDIDATES = [
  path.join('.kb', 'kb.config.jsonc'),
  path.join('.kb', 'kb.config.json'),
  'kb.config.jsonc',
  'kb.config.json',
] as const;

export interface MergedRawConfigResult {
  /** Effective merged data (platform ← project ← overlays). */
  data: Record<string, unknown>;
  /** Absolute path to the platform config file, if one was loaded. */
  platformConfigPath?: string;
  /** Absolute path to the project config file, if one was loaded. */
  projectConfigPath?: string;
  /** Absolute paths of overlays applied, in merge order. */
  overlayPaths: string[];
  /** Non-fatal diagnostics (malformed files, etc). */
  diagnostics: Diagnostic[];
}

export interface ReadMergedRawConfigOptions {
  /**
   * Optional platform installation root. When set and distinct from
   * `projectRoot`, its `kb.config.*` is read first and used as the
   * deep-merge baseline. Overlays are *not* read from this root —
   * overlays are a project-local concept.
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
 * Read the effective raw config, deep-merged across platform → project →
 * project overlays. See module doc for layering details.
 */
export async function readMergedRawConfig(
  projectRoot: string,
  options: ReadMergedRawConfigOptions = {},
): Promise<MergedRawConfigResult | null> {
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
