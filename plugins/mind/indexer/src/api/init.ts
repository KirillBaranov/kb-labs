/**
 * Initialize Mind structure API
 */

import { ensureMindStructure } from "../fs/ensure";
import { writeJson } from "../fs/json";
import { getGenerator, toPosix } from "@kb-labs/mind-core";
import { promises as fsp } from "node:fs";
import type { InitOptions } from "../types/index";
import type { MindIndex, ApiIndex, DepsGraph, RecentDiff } from "@kb-labs/mind-types";

/**
 * Initialize Mind structure with empty JSON artifacts
 */
export async function initMindStructure(opts: InitOptions): Promise<string> {
  const { cwd, log } = opts;
  
  try {
    // Ensure directory structure
    const mindDir = await ensureMindStructure(cwd);
    log?.({ level: 'info', msg: 'Created .kb/mind directory structure', path: mindDir });

    // Check if index.json already exists
    const indexPath = `${mindDir}/index.json`;
    try {
      await fsp.access(indexPath);
      log?.({ level: 'info', msg: 'Mind structure already exists', path: mindDir });
      return mindDir;
    } catch {
      // Index doesn't exist, continue with initialization
    }

    const generator = getGenerator();
    const now = new Date().toISOString();

    // Create empty index.json
    const index: MindIndex = {
      schemaVersion: "1.0",
      generator,
      updatedAt: now,
      root: cwd,
      filesIndexed: 0,
      apiIndexHash: "",
      depsHash: "",
      recentDiffHash: "",
      indexChecksum: ""
    };

    // Create empty api-index.json
    const apiIndex: ApiIndex = {
      schemaVersion: "1.0",
      generator,
      files: {}
    };

    // Create empty deps.json
    const depsGraph: DepsGraph = {
      schemaVersion: "1.0",
      generator,
      root: toPosix(cwd),
      packages: {},
      edges: []
    };

    // Create empty recent-diff.json
    const recentDiff: RecentDiff = {
      schemaVersion: "1.0",
      generator,
      since: "",
      files: []
    };

    // Write all files atomically
    await Promise.all([
      writeJson(`${mindDir}/index.json`, index),
      writeJson(`${mindDir}/api-index.json`, apiIndex),
      writeJson(`${mindDir}/deps.json`, depsGraph),
      writeJson(`${mindDir}/recent-diff.json`, recentDiff)
    ]);

    log?.({ level: 'info', msg: 'Initialized Mind structure with empty artifacts' });
    return mindDir;
  } catch (error: any) {
    log?.({ level: 'error', msg: 'Failed to initialize Mind structure', error: error.message });
    throw error;
  }
}
