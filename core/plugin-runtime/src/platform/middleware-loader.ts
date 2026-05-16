import { pathToFileURL } from 'node:url';
import * as nodePath from 'node:path';
import type { AdapterMiddlewareDecl, RawMiddlewareDecl } from '@kb-labs/core-platform';
import type { LoadedMiddleware } from './pipeline.js';
import type { AdapterMiddlewareFn } from './middleware.js';

export type { RawMiddlewareDecl } from '@kb-labs/core-platform';

/**
 * Resolve raw middleware declarations into loaded middleware functions.
 *
 * Called once per InProcessBackend and cached; not called on every plugin execution.
 * Skips entries where the handler file cannot be imported (logs a warning, does not throw).
 */
export async function resolveAdapterMiddlewares(
  rawDecls: RawMiddlewareDecl[],
  logger?: { warn(msg: string, meta?: Record<string, unknown>): void },
): Promise<LoadedMiddleware[]> {
  const result: LoadedMiddleware[] = [];

  for (const { pkgRoot, decl } of rawDecls) {
    const handlerPath = nodePath.resolve(pkgRoot, decl.handler);
    try {
      const mod = await import(pathToFileURL(handlerPath).href);
      const fn: AdapterMiddlewareFn<unknown> = mod.middleware ?? mod.default;
      if (typeof fn !== 'function') {
        logger?.warn('Adapter middleware handler has no default or named export "middleware"', {
          handler: handlerPath,
          id: decl.id,
        });
        continue;
      }
      result.push({ decl, fn });
    } catch (err) {
      logger?.warn('Failed to load adapter middleware handler', {
        handler: handlerPath,
        id: decl.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
