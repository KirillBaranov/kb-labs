/**
 * @module @kb-labs/core-config/profiles/scope-selector
 * Resolve active scope based on include/exclude globs and CLI flags.
 */

import path from 'node:path';
import picomatch from 'picomatch';
import type { BundleProfile, ResolvedScope } from './types';
import { KbError, ERROR_HINTS } from '../errors/kb-error';

export type ScopeSelectionStrategy = 'explicit' | 'default' | 'auto' | 'none';

export interface ScopeSelectionOptions {
  bundleProfile: BundleProfile;
  cwd: string;
  executionPath: string;
  scopeId?: string;
}

export interface ScopeSelectionResult {
  scope?: ResolvedScope;
  strategy: ScopeSelectionStrategy;
  matchedPath?: string;
}

export function selectProfileScope(
  opts: ScopeSelectionOptions
): ScopeSelectionResult {
  const scopes = opts.bundleProfile.scopes || [];
  if (scopes.length === 0) {
    return { strategy: 'none' };
  }

  if (opts.scopeId) {
    const scope = scopes.find((s) => s.id === opts.scopeId);
    if (!scope) {
      throw new KbError(
        'ERR_PROFILE_SCOPE_NOT_FOUND',
        `Scope "${opts.scopeId}" not found in profile "${opts.bundleProfile.id}"`,
        ERROR_HINTS.ERR_PROFILE_SCOPE_NOT_FOUND,
        { scopeId: opts.scopeId, available: scopes.map((s) => s.id) }
      );
    }
    return { scope, strategy: 'explicit' };
  }

  const defaults = scopes.filter((s) => s.isDefault);
  if (defaults.length > 1) {
    throw new KbError(
      'ERR_PROFILE_SCOPE_CONFLICT',
      `Multiple default scopes found in profile "${opts.bundleProfile.id}"`,
      ERROR_HINTS.ERR_PROFILE_SCOPE_CONFLICT,
      { scopes: defaults.map((s) => s.id) }
    );
  }
  if (defaults.length === 1) {
    return { scope: defaults[0], strategy: 'default' };
  }

  const relativePath = normalizePath(
    path.relative(opts.cwd, opts.executionPath)
  );
  const matches = scopes.filter((scope) =>
    scopeMatchesPath(scope, relativePath)
  );

  if (matches.length > 1) {
    throw new KbError(
      'ERR_PROFILE_SCOPE_CONFLICT',
      `Multiple scopes match path "${relativePath}"`,
      ERROR_HINTS.ERR_PROFILE_SCOPE_CONFLICT,
      { scopes: matches.map((s) => s.id), path: relativePath }
    );
  }

  if (matches.length === 1) {
    return { scope: matches[0], strategy: 'auto', matchedPath: relativePath };
  }

  return { strategy: 'none' };
}

function scopeMatchesPath(scope: ResolvedScope, candidate: string): boolean {
  const includes = scope.include && scope.include.length > 0
    ? scope.include
    : ['**/*'];
  const excludeGlobs = scope.exclude || [];

  const tester = (glob: string) =>
    picomatch(glob, { dot: true, nocase: false })(candidate);

  const includeMatched =
    candidate === '.' ||
    includes.some((glob) => tester(adjustGlob(glob)));

  if (!includeMatched) {
    return false;
  }

  const excludeMatched = excludeGlobs.some((glob) =>
    tester(adjustGlob(glob))
  );

  return !excludeMatched;
}

function normalizePath(p: string): string {
  if (!p || p === '.') {
    return '.';
  }
  const normalized = p.split(path.sep).join('/');
  return normalized || '.';
}

function adjustGlob(glob: string): string {
  if (!glob) {
    return '**/*';
  }
  return glob;
}

