/**
 * @module @kb-labs/core/config/overlay/merged-raw
 *
 * Overlay-aware raw config reader. Returns the project's `kb.config.*`
 * deep-merged with `.kb/overlays/*.jsonc` overlays.
 *
 * Use this when a plugin needs to read its own section from the project
 * config and wants to honor scenario overlays applied via
 * `kb-dev ensure --scenario`. Plugins that consume `loadPlatformConfig`
 * already get this for free — this helper exists for plugins that read
 * their own section (e.g. `gateway`, `mind`) bypassing the platform
 * loader.
 *
 * Semantics match the platform loader:
 *   - base = project `kb.config.json` / `kb.config.jsonc` (whichever exists)
 *   - overlays = `.kb/overlays/*.jsonc`, lex-sorted, applied with
 *     `mergeOverlay` (arrays replace by default, `kb:merge: append` honoured)
 *
 * Returns `null` when neither a project config nor any overlay file exists.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { readJsonWithDiagnostics } from '../runtime/runtime.js';
import type { Diagnostic } from '../types/index.js';
import { loadOverlays } from './loader.js';
import { mergeOverlay } from './merge.js';

const PROJECT_CONFIG_CANDIDATES = [
  path.join('.kb', 'kb.config.jsonc'),
  path.join('.kb', 'kb.config.json'),
  'kb.config.jsonc',
  'kb.config.json',
] as const;

export interface MergedRawConfigResult {
  /** Effective merged data (project config + overlays). */
  data: Record<string, unknown>;
  /** Absolute path to the project config file, if one was loaded. */
  projectConfigPath?: string;
  /** Absolute paths of overlays applied, in merge order. */
  overlayPaths: string[];
  /** Non-fatal diagnostics (malformed files, etc). */
  diagnostics: Diagnostic[];
}

async function findProjectConfig(projectRoot: string): Promise<string | undefined> {
  for (const rel of PROJECT_CONFIG_CANDIDATES) {
    const full = path.join(projectRoot, rel);
    try {
      await fsp.access(full);
      return full;
    } catch {
      // continue
    }
  }
  return undefined;
}

/**
 * Read the project's `kb.config.*` and apply `.kb/overlays/*.jsonc` on top.
 *
 * Returns `null` only when neither the project config nor any overlay exists.
 * When the project config is missing but overlays are present, returns the
 * overlay merge starting from an empty base.
 */
export async function readMergedRawConfig(projectRoot: string): Promise<MergedRawConfigResult | null> {
  const diagnostics: Diagnostic[] = [];

  const configPath = await findProjectConfig(projectRoot);
  let base: Record<string, unknown> = {};
  let projectConfigPath: string | undefined;

  if (configPath) {
    const read = await readJsonWithDiagnostics<unknown>(configPath);
    diagnostics.push(...read.diagnostics);
    if (read.ok) {
      const data = read.data;
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        base = data as Record<string, unknown>;
        projectConfigPath = configPath;
      } else {
        diagnostics.push({
          level: 'error',
          code: 'CONFIG_NOT_OBJECT',
          message: `Project config must be a JSON object at top level: ${configPath}`,
        });
      }
    }
  }

  const overlayResult = await loadOverlays(projectRoot);
  diagnostics.push(...overlayResult.diagnostics);

  if (!configPath && overlayResult.overlays.length === 0) {
    return null;
  }

  let merged: Record<string, unknown> = base;
  const overlayPaths: string[] = [];
  for (const overlay of overlayResult.overlays) {
    merged = mergeOverlay(merged, overlay.data);
    overlayPaths.push(overlay.path);
  }

  return {
    data: merged,
    projectConfigPath,
    overlayPaths,
    diagnostics,
  };
}
