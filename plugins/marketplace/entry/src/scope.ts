/**
 * @module @kb-labs/marketplace-entry/scope
 *
 * Client-side scope resolution for marketplace CLI commands. Uses the
 * canonical `findProjectConfigRoot` helper from `@kb-labs/core-workspace`
 * so the detection rules (which filenames count, how walk-up stops) match
 * what the config loader and the marketplace daemon enforce.
 *
 * Rules:
 *  - `project` is the default if cwd (or any ancestor up to the filesystem
 *    root) contains `.kb/kb.config.{json,jsonc}`.
 *  - Otherwise the default is `platform`.
 *  - `--scope` always overrides detection.
 *  - For scope="project" we return the absolute projectRoot so the daemon
 *    doesn't need to re-discover it.
 */

import { findProjectConfigRoot } from '@kb-labs/core-workspace';
import type { MarketplaceScope, MarketplaceQueryScope } from '@kb-labs/marketplace-contracts';

export const SCOPE_FLAG_CHOICES: readonly MarketplaceScope[] = ['platform', 'project'];
export const QUERY_SCOPE_FLAG_CHOICES: readonly MarketplaceQueryScope[] = ['platform', 'project', 'all'];

export interface ResolvedCliScope {
  scope: MarketplaceScope;
  projectRoot?: string;
  /** How the scope was determined — surfaces in --verbose logs. */
  reason: 'flag' | 'auto-detect' | 'fallback';
}

export interface ResolvedCliQueryScope extends Omit<ResolvedCliScope, 'scope'> {
  scope: MarketplaceQueryScope;
}

/**
 * Resolve the effective scope for a mutating command (`link`, `unlink`,
 * `install`, ...). `flag` is the value of `--scope` (if supplied). The
 * helper never returns `'all'` for mutating commands — callers restrict
 * choices via `SCOPE_FLAG_CHOICES`.
 */
export async function resolveCliScope(
  cwd: string,
  flag: string | undefined,
): Promise<ResolvedCliScope> {
  if (flag) {
    assertMutatingScope(flag);
    if (flag === 'project') {
      const projectRoot = await findProjectConfigRoot(cwd);
      if (!projectRoot) {
        throw new CliScopeError(
          'SCOPE_PROJECT_ROOT_NOT_FOUND',
          `--scope=project requires a .kb/kb.config.{json,jsonc} ancestor of ${cwd} — none found.`,
        );
      }
      return { scope: 'project', projectRoot, reason: 'flag' };
    }
    return { scope: 'platform', reason: 'flag' };
  }

  const projectRoot = await findProjectConfigRoot(cwd);
  if (projectRoot) {
    return { scope: 'project', projectRoot, reason: 'auto-detect' };
  }
  return { scope: 'platform', reason: 'fallback' };
}

/**
 * Resolve the effective scope for a read-only command (`list`). Accepts
 * `'all'` as an explicit flag value.
 */
export async function resolveCliQueryScope(
  cwd: string,
  flag: string | undefined,
): Promise<ResolvedCliQueryScope> {
  if (flag === 'all') {
    const projectRoot = await findProjectConfigRoot(cwd);
    return { scope: 'all', projectRoot, reason: 'flag' };
  }
  const base = await resolveCliScope(cwd, flag);
  return { scope: base.scope, projectRoot: base.projectRoot, reason: base.reason };
}

function assertMutatingScope(value: string): asserts value is MarketplaceScope {
  if (!SCOPE_FLAG_CHOICES.includes(value as MarketplaceScope)) {
    throw new CliScopeError(
      'SCOPE_INVALID',
      `--scope must be one of: ${SCOPE_FLAG_CHOICES.join(', ')} (got ${JSON.stringify(value)})`,
    );
  }
}

export class CliScopeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CliScopeError';
  }
}

/**
 * Build the body-payload fragment expected by `parseMutatingScope` on the
 * API side: `{ scope, projectRoot? }`. Kept as a helper so every command
 * sends the same shape and nothing drifts out-of-sync with the server.
 */
export function scopeBody(ctx: ResolvedCliScope | ResolvedCliQueryScope): {
  scope: MarketplaceScope | MarketplaceQueryScope;
  projectRoot?: string;
} {
  return {
    scope: ctx.scope,
    ...(ctx.projectRoot ? { projectRoot: ctx.projectRoot } : {}),
  };
}
