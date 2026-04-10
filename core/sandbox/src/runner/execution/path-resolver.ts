/**
 * @module @kb-labs/core-sandbox/runner/execution/path-resolver
 * Resolve handler file paths for plugin execution
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { HandlerRef } from '../../types/index';

export interface PathResolverOptions {
  pluginRoot: string;
  handlerRef: HandlerRef;
}

export interface ResolvedPath {
  /** Absolute file path to handler */
  filePath: string;
  /** file:// URL for ES module import */
  fileUrl: string;
}

/**
 * Resolve handler file path from HandlerRef
 *
 * Tries multiple paths in order:
 * 1. dist/{handler}.js (built file)
 * 2. {handler}.js (relative to pluginRoot)
 * 3. handlerRef.file as-is
 *
 * @param options - Resolution options
 * @returns Resolved absolute path and URL
 * @throws Error if handler file not found
 */
export async function resolveHandlerPath(options: PathResolverOptions): Promise<ResolvedPath> {
  const { pluginRoot, handlerRef } = options;

  // Debug log
  const debugMode = process.env.KB_LOG_LEVEL === 'debug' || process.env.KB_JOBS_DEBUG === 'true';
  if (debugMode) {
    console.error(`[path-resolver] Resolving handler: file=${handlerRef.file}, pluginRoot=${pluginRoot}`);
  }

  // Remove leading './' if present
  const handlerFile = handlerRef.file.replace(/^\.\//, '');

  // Ensure .js extension
  const handlerFileExt = handlerFile.endsWith('.js') ? handlerFile : handlerFile + '.js';

  // Try multiple paths:
  // 1. dist/cli/init.js (built file)
  // 2. cli/init.js (relative to pluginRoot)
  // 3. handler.file as-is
  const distPath = path.join(pluginRoot, 'dist', handlerFileExt);
  const relativePath = path.join(pluginRoot, handlerFileExt);
  const directPath = path.resolve(pluginRoot, handlerRef.file.endsWith('.js') ? handlerRef.file : handlerRef.file + '.js');

  if (debugMode) {
    console.error(`[path-resolver] Trying paths: dist=${distPath}, relative=${relativePath}, direct=${directPath}`);
  }

  // Try to find which path exists
  let finalHandlerPath: string;

  try {
    await fs.access(distPath);
    finalHandlerPath = distPath;
  } catch {
    try {
      await fs.access(relativePath);
      finalHandlerPath = relativePath;
    } catch {
      try {
        await fs.access(directPath);
        finalHandlerPath = directPath;
      } catch {
        // Fallback to dist path (will error if doesn't exist)
        finalHandlerPath = distPath;
      }
    }
  }

  // Convert to file:// URL for ES module import
  const handlerUrl = pathToFileURL(finalHandlerPath).href;

  return {
    filePath: finalHandlerPath,
    fileUrl: handlerUrl,
  };
}
