/**
 * @module @kb-labs/core-config/api/read-kb-config
 * Find + read kb.config.* files (product-level workspace config).
 */

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { findGitRoot, readConfigFile, type ConfigFileResult } from './read-config';

const KB_CONFIG_FILENAMES = [
  'kb.config.json',
  'kb.config.yaml',
  'kb.config.yml',
  '.kb/kb.config.json',
  '.kb/kb.config.yaml',
  '.kb/kb.config.yml',
];

export type KbConfigResult = ConfigFileResult;

export async function findKbConfig(
  cwd: string,
  filenames: string[] = KB_CONFIG_FILENAMES
): Promise<{ path: string | null; tried: string[] }> {
  const tried: string[] = [];
  const gitRoot = await findGitRoot(cwd);
  const stopDir = gitRoot || path.parse(cwd).root;
  let dir = path.resolve(cwd);

  while (true) {
    for (const filename of filenames) {
      const candidate = path.join(dir, filename);
      tried.push(candidate);
      try {
        await fsp.access(candidate);
        return { path: candidate, tried };
      } catch {
        // continue
      }
    }

    if (dir === stopDir || dir === path.dirname(dir)) {
      break;
    }

    dir = path.dirname(dir);
  }

  return { path: null, tried };
}

export async function readKbConfig(cwd: string): Promise<KbConfigResult | null> {
  const { path } = await findKbConfig(cwd);
  if (!path) {
    return null;
  }
  return readConfigFile(path);
}

