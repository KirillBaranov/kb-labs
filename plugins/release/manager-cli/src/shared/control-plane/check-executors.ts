/**
 * Executors for the §6A.3 check groups the plugin can evaluate itself.
 *
 * The split between "has an executor here" and "declared without one" follows
 * ownership, not effort: a check lives here when the evidence it needs exists
 * inside the repository or the sealed bundle. Registry propagation and consumer
 * install evidence do not — they are produced by CI (PR 6) and `kb-create`
 * (PR 7) — so those groups stay declared-and-unimplemented rather than being
 * approximated with a local stand-in that would pass for the wrong reasons.
 *
 * Every executor returns diagnostics with a code, so a failure is machine-
 * readable in exactly the way the bundle verifier's are.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import semver from 'semver';

import { verifyBundleDirectory } from '../verify-bundle.js';
import type { ReleaseCheckContext, ReleaseCheckDefinition, ReleaseCheckOutcome } from './checks.js';
import { RELEASE_CHECK_GROUPS } from './checks.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * Branch, working-tree cleanliness, tag availability and intent binding.
 *
 * These four travel together because they are the same question asked four
 * ways: "is the tree this release claims to be built from the tree that
 * actually exists". A dirty tree, a wrong branch or an already-taken tag each
 * mean the answer is no.
 */
export function branchCleanTagIntentCheck(
  options: { expectedBranch?: string; releaseTag?: string; intentSha256?: string } = {},
) {
  return (ctx: ReleaseCheckContext): ReleaseCheckOutcome => {
    const diagnostics: ReleaseCheckOutcome['diagnostics'] = [];
    const expectedBranch = options.expectedBranch ?? 'master';

    let head = '';
    try {
      head = git(ctx.repoRoot, ['rev-parse', 'HEAD']);
      const branch = git(ctx.repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (branch !== expectedBranch) {
        diagnostics.push({
          code: 'KB_RELEASE_CHECK_BRANCH',
          message: `Releases are cut from ${expectedBranch}; HEAD is on ${branch}.`,
          subject: branch,
          severity: 'error',
        });
      }

      const status = git(ctx.repoRoot, ['status', '--porcelain']);
      if (status.length > 0) {
        diagnostics.push({
          code: 'KB_RELEASE_CHECK_DIRTY_TREE',
          message: 'The working tree has uncommitted changes; the release would not be reproducible from any commit.',
          severity: 'error',
        });
      }

      if (options.releaseTag) {
        const existing = git(ctx.repoRoot, ['tag', '--list', options.releaseTag]);
        if (existing.length > 0) {
          diagnostics.push({
            code: 'KB_RELEASE_CHECK_TAG_TAKEN',
            message: `Tag ${options.releaseTag} already exists — that version was already allocated and can never be reused.`,
            subject: options.releaseTag,
            severity: 'error',
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        code: 'KB_RELEASE_CHECK_GIT_UNAVAILABLE',
        message: `Could not inspect git state: ${(error as Error).message}`,
        severity: 'error',
      });
    }

    if (!options.intentSha256) {
      diagnostics.push({
        code: 'KB_RELEASE_CHECK_INTENT_UNBOUND',
        message: 'No intent digest was supplied, so this run is not bound to a planned release decision.',
        severity: 'error',
      });
    }

    return {
      ok: diagnostics.length === 0,
      diagnostics,
      evidenceRef: head || null,
    };
  };
}

/**
 * Lockfile presence/integrity, toolchain pin and dependency direction.
 *
 * "Dependency direction" is checked as: nothing in the release depends on a
 * workspace package outside the release set at a version that does not exist
 * yet. That is the direction that actually breaks consumers — a released
 * package pointing at something unreleased.
 */
export function lockfileToolchainCheck(
  options: { releasedPackages?: readonly { name: string; path: string }[] } = {},
) {
  return (ctx: ReleaseCheckContext): ReleaseCheckOutcome => {
    const diagnostics: ReleaseCheckOutcome['diagnostics'] = [];

    const lockfile = join(ctx.repoRoot, 'pnpm-lock.yaml');
    if (!existsSync(lockfile)) {
      diagnostics.push({
        code: 'KB_RELEASE_CHECK_LOCKFILE_MISSING',
        message: 'pnpm-lock.yaml is absent; the dependency set of this release is not pinned.',
        severity: 'error',
      });
    }

    const rootManifestPath = join(ctx.repoRoot, 'package.json');
    let rootManifest: { packageManager?: string; engines?: { node?: string } } = {};
    try {
      rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8'));
    } catch {
      diagnostics.push({
        code: 'KB_RELEASE_CHECK_ROOT_MANIFEST',
        message: `Root package.json at ${rootManifestPath} is unreadable.`,
        severity: 'error',
      });
    }
    if (!rootManifest.packageManager) {
      diagnostics.push({
        code: 'KB_RELEASE_CHECK_TOOLCHAIN_UNPINNED',
        message: 'Root package.json has no "packageManager" pin; the build toolchain is not reproducible.',
        severity: 'error',
      });
    }

    // Dependency direction: a released package must not carry a `workspace:`
    // dependency on a package that is not itself in the release set. Publishing
    // one ships a specifier no consumer can resolve — the dependency points
    // "inward" at something that never leaves the monorepo.
    for (const pkg of options.releasedPackages ?? []) {
      const released = new Set((options.releasedPackages ?? []).map(entry => entry.name));
      let manifest: Record<string, Record<string, string> | undefined>;
      try {
        manifest = JSON.parse(readFileSync(join(pkg.path, 'package.json'), 'utf8'));
      } catch {
        diagnostics.push({
          code: 'KB_RELEASE_CHECK_PACKAGE_MANIFEST',
          message: `package.json for ${pkg.name} is unreadable at ${pkg.path}.`,
          subject: pkg.name,
          severity: 'error',
        });
        continue;
      }
      for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
        for (const [dependency, range] of Object.entries(manifest[section] ?? {})) {
          if (typeof range === 'string' && range.startsWith('workspace:') && !released.has(dependency)) {
            diagnostics.push({
              code: 'KB_RELEASE_CHECK_DEPENDENCY_DIRECTION',
              message:
                `${pkg.name} depends on workspace package ${dependency} (${section}), which is not in the release set. ` +
                'The published package would carry an unresolvable specifier.',
              subject: `${pkg.name} → ${dependency}`,
              severity: 'error',
            });
          }
        }
      }
    }

    return { ok: diagnostics.length === 0, diagnostics, evidenceRef: null };
  };
}

/**
 * Migration rollback class and previous-stable downgrade validation.
 *
 * Stable-only, because a downgrade path can only be validated against the
 * stable release it would replace. Every migration shipping in the release must
 * declare a `rollbackClass`; an undeclared one is treated as a failure rather
 * than as "probably reversible", because the entire stable rollback boundary
 * (§3C) is computed from these declarations.
 */
export function migrationRollbackCheck(options: { version: string; previousStableVersion?: string | null }) {
  return (ctx: ReleaseCheckContext): ReleaseCheckOutcome => {
    const diagnostics: ReleaseCheckOutcome['diagnostics'] = [];
    const manifestPath = join(ctx.repoRoot, '.kb', 'release', 'migrations', `${options.version}.json`);

    if (!existsSync(manifestPath)) {
      // No migrations declared is a legitimate answer — most releases have
      // none. It is an *undeclared* migration that is dangerous, and that is
      // what an empty manifest asserts the absence of.
      return {
        ok: true,
        diagnostics: [{
          code: 'KB_RELEASE_CHECK_NO_MIGRATIONS',
          message: `No migration manifest at ${manifestPath}; the release declares no migrations.`,
          severity: 'info',
        }],
        evidenceRef: null,
      };
    }

    let manifest: {
      migrations?: Array<{ id?: string; rollbackClass?: string; downgradeTo?: string }>;
    };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          code: 'KB_RELEASE_CHECK_MIGRATION_MANIFEST_UNREADABLE',
          message: `Migration manifest ${manifestPath} is not readable JSON: ${(error as Error).message}`,
          severity: 'error',
        }],
        evidenceRef: manifestPath,
      };
    }

    const allowed = new Set(['reversible', 'forward-only', 'destructive']);
    for (const migration of manifest.migrations ?? []) {
      const id = migration.id ?? '(unnamed)';
      if (!migration.rollbackClass || !allowed.has(migration.rollbackClass)) {
        diagnostics.push({
          code: 'KB_RELEASE_CHECK_ROLLBACK_CLASS_UNDECLARED',
          message:
            `Migration ${id} declares rollbackClass ${JSON.stringify(migration.rollbackClass)}; ` +
            `expected one of ${[...allowed].join(', ')}. The stable rollback boundary is computed from these.`,
          subject: id,
          severity: 'error',
        });
        continue;
      }
      if (migration.rollbackClass === 'reversible') {
        if (!options.previousStableVersion) {
          diagnostics.push({
            code: 'KB_RELEASE_CHECK_NO_PREVIOUS_STABLE',
            message: `Migration ${id} claims to be reversible but there is no previous stable release to downgrade to.`,
            subject: id,
            severity: 'error',
          });
          continue;
        }
        if (!migration.downgradeTo || !semver.valid(migration.downgradeTo)) {
          diagnostics.push({
            code: 'KB_RELEASE_CHECK_DOWNGRADE_TARGET_MISSING',
            message: `Reversible migration ${id} does not name a valid downgradeTo version.`,
            subject: id,
            severity: 'error',
          });
          continue;
        }
        if (semver.gt(migration.downgradeTo, options.previousStableVersion)) {
          diagnostics.push({
            code: 'KB_RELEASE_CHECK_DOWNGRADE_UNREACHABLE',
            message:
              `Migration ${id} downgrades only to ${migration.downgradeTo}, which is newer than the current stable ` +
              `${options.previousStableVersion}; a rollback would strand installations.`,
            subject: id,
            severity: 'error',
          });
        }
      }
    }

    return { ok: diagnostics.length === 0, diagnostics, evidenceRef: manifestPath };
  };
}

/**
 * Artifact-stage checks, both backed by the PR 2 bundle verifier.
 *
 * The verifier already reports every §6A.2 rule violation with a rule number
 * and a code; re-implementing subsets of it here would create a second opinion
 * about the same bytes. Instead each group *selects* the rules it gates on and
 * forwards the verifier's own diagnostics unchanged.
 */
export function bundleRuleCheck(rules: readonly number[]) {
  return (ctx: ReleaseCheckContext): ReleaseCheckOutcome => {
    if (!ctx.bundleDir) {
      return {
        ok: false,
        diagnostics: [{
          code: 'KB_RELEASE_CHECK_NO_BUNDLE',
          message: 'Artifact-stage checks require a sealed bundle directory; none was supplied.',
          severity: 'error',
        }],
        evidenceRef: null,
      };
    }
    const report = verifyBundleDirectory(ctx.bundleDir);
    const relevant = report.diagnostics.filter(diagnostic => rules.includes(diagnostic.rule));
    return {
      ok: relevant.length === 0,
      diagnostics: relevant.map(diagnostic => ({
        code: diagnostic.code,
        message: `[§6A.2 rule ${diagnostic.rule}] ${diagnostic.message}`,
        ...(diagnostic.subject ? { subject: diagnostic.subject } : {}),
        severity: 'error' as const,
      })),
      evidenceRef: report.bundleSha256,
    };
  };
}

export interface CheckExecutorBindings {
  expectedBranch?: string;
  releaseTag?: string;
  intentSha256?: string;
  version?: string;
  previousStableVersion?: string | null;
  releasedPackages?: readonly { name: string; path: string }[];
  /**
   * Executor for the config-driven build/lint/typecheck/unit and
   * pack/clean-install groups. Those run real commands through the plugin
   * runtime's governed shell, which is not available to this module, so the
   * caller supplies them.
   */
  runConfiguredChecks?: (id: string, ctx: ReleaseCheckContext) => Promise<ReleaseCheckOutcome>;
}

/**
 * Binds executors onto the declared groups.
 *
 * Returns the full group list, not just the bound ones: a caller must always
 * see every gate, including the ones that are still unimplemented, because the
 * report is what decides whether a gate is open.
 */
export function bindCheckExecutors(bindings: CheckExecutorBindings): ReleaseCheckDefinition[] {
  const configured = bindings.runConfiguredChecks;
  return RELEASE_CHECK_GROUPS.map((definition): ReleaseCheckDefinition => {
    switch (definition.id) {
      case 'source.branch-clean-tag-intent':
        return { ...definition, run: branchCleanTagIntentCheck(bindings) };
      case 'source.lockfile-toolchain-dependency-direction':
        return {
          ...definition,
          run: lockfileToolchainCheck(
            bindings.releasedPackages ? { releasedPackages: bindings.releasedPackages } : {},
          ),
        };
      case 'source.build-lint-typecheck-unit':
      case 'source.pack-clean-install':
        return configured
          ? { ...definition, run: ctx => configured(definition.id, ctx) }
          : definition;
      case 'source.migration-rollback-class-downgrade':
        return bindings.version
          ? {
            ...definition,
            run: migrationRollbackCheck({
              version: bindings.version,
              previousStableVersion: bindings.previousStableVersion ?? null,
            }),
          }
          : definition;
      case 'artifact.package-manifest-publishability':
        // Rules 4 and 6: package/provenance consistency and classification.
        return { ...definition, run: bundleRuleCheck([4, 6]) };
      case 'artifact.checksums-inventory-graph':
        // Rules 1–3, 5 and 7: digests, closed inventory and graph coverage.
        return { ...definition, run: bundleRuleCheck([1, 2, 3, 5, 7]) };
      default:
        return definition;
    }
  });
}
