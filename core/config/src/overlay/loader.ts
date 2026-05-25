/**
 * @module @kb-labs/core/config/overlay/loader
 *
 * Discovers and reads `.kb/overlays/*.jsonc` files from a project root, in
 * stable lexicographic order. Each overlay is parsed via the existing
 * `readJsonWithDiagnostics` (so JSONC comments and trailing commas are
 * supported). Files that fail to parse are reported as diagnostics but do not
 * abort the load — callers decide whether to ignore or fail.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { readJsonWithDiagnostics } from '../runtime/runtime.js';
import type { Diagnostic } from '../types/index.js';

export interface LoadedOverlay {
  /** Absolute path to the overlay file. */
  path: string;
  /** File name (without directory), e.g. `pressure__overlay.jsonc`. */
  name: string;
  /** Parsed contents. Always a plain object — files whose top-level value is
   *  not an object are rejected with a diagnostic. */
  data: Record<string, unknown>;
}

export interface LoadOverlaysResult {
  overlays: LoadedOverlay[];
  diagnostics: Diagnostic[];
}

/**
 * Read `.kb/overlays/*.jsonc` from the given project root.
 *
 * - Returns `{ overlays: [], diagnostics: [] }` when the directory does not
 *   exist (the common case in projects that don't use overlays).
 * - Files are returned sorted by lexicographic file-name. The merge order at
 *   the call site is the same order — later files override earlier ones.
 * - Non-`.jsonc` files in the directory are ignored silently.
 */
export async function loadOverlays(projectRoot: string): Promise<LoadOverlaysResult> {
  const dir = path.join(projectRoot, '.kb', 'overlays');
  const diagnostics: Diagnostic[] = [];

  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return { overlays: [], diagnostics };
    }
    diagnostics.push({
      level: 'error',
      code: 'OVERLAYS_DIR_READ_FAILED',
      message: `Failed to read overlays directory: ${dir}`,
      detail: String(e),
    });
    return { overlays: [], diagnostics };
  }

  const jsoncFiles = entries.filter((name) => name.endsWith('.jsonc')).sort();
  const overlays: LoadedOverlay[] = [];

  for (const name of jsoncFiles) {
    const full = path.join(dir, name);
    const read = await readJsonWithDiagnostics<unknown>(full);
    diagnostics.push(...read.diagnostics);
    if (!read.ok) {
      continue;
    }
    const data = read.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      diagnostics.push({
        level: 'error',
        code: 'OVERLAY_NOT_OBJECT',
        message: `Overlay must be a JSON object at top level: ${full}`,
      });
      continue;
    }
    overlays.push({ path: full, name, data: data as Record<string, unknown> });
  }

  return { overlays, diagnostics };
}
