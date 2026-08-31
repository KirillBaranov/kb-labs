/**
 * The only mutations `release stage` is allowed to apply.
 *
 * Per cutover plan §6A.2 staging applies "only the planned version/changelog/
 * dependency mutations". The mutation set is *derived from the intent*, never
 * invented here: the plan already fixed every target version, so this module's
 * job is to turn that package set into an exact, ordered, reproducible list of
 * file edits and to prove — via `intent.mutationSha256` — that the list it is
 * about to apply is the one the intent was signed over.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import { canonicalSha256 } from '@kb-labs/release-manager-contracts';

import { gitOrThrow } from './git.js';
import type { CandidateReleaseIntent } from './intent.js';

const PACKAGE_JSON = 'package.json';
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
type DependencySection = typeof DEPENDENCY_SECTIONS[number];

export interface VersionMutation {
  /** Worktree-relative directory, POSIX-separated so the digest is platform-stable. */
  dir: string;
  name: string;
  from: string;
  to: string;
}

export interface DependencyMutation {
  dir: string;
  section: DependencySection;
  dependency: string;
  from: string;
  to: string;
}

export interface ChangelogMutation {
  /** Worktree-relative path, POSIX-separated. */
  path: string;
  sha256: string;
  bytes: number;
}

export interface MutationPlan {
  schema: 'kb.release-mutation/1';
  versions: VersionMutation[];
  dependencies: DependencyMutation[];
  changelogs: ChangelogMutation[];
}

export interface WorkspacePackage {
  name: string;
  version: string;
  /** Worktree-relative directory, POSIX-separated. */
  dir: string;
}

/**
 * Every tracked `package.json` in the worktree, keyed by package name.
 *
 * Reads the git index rather than walking the filesystem: an untracked
 * `package.json` (a scratch fixture, a stale build output) must never become
 * part of a release, and `git ls-files` output is already sorted, which keeps
 * the derived mutation plan byte-stable.
 */
export function discoverWorkspacePackages(worktreePath: string): WorkspacePackage[] {
  const listed = gitOrThrow(worktreePath, ['ls-files', '--', `*${PACKAGE_JSON}`, PACKAGE_JSON])
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const packages: WorkspacePackage[] = [];
  const seen = new Set<string>();

  for (const relativePath of listed) {
    if (relativePath.includes('node_modules/')) { continue; }
    if (!relativePath.endsWith(PACKAGE_JSON)) { continue; }

    const dir = relativePath === PACKAGE_JSON ? '.' : relativePath.slice(0, -(PACKAGE_JSON.length + 1));
    let manifest: { name?: unknown; version?: unknown };
    try {
      manifest = JSON.parse(readFileSync(join(worktreePath, relativePath.split('/').join(sep)), 'utf8')) as typeof manifest;
    } catch {
      continue;
    }
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') { continue; }
    if (seen.has(manifest.name)) {
      throw new Error(`workspace declares ${manifest.name} in more than one directory`);
    }
    seen.add(manifest.name);
    packages.push({ name: manifest.name, version: manifest.version, dir });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

function readManifest(worktreePath: string, dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(manifestPath(worktreePath, dir), 'utf8')) as Record<string, unknown>;
}

function manifestPath(worktreePath: string, dir: string): string {
  return join(worktreePath, ...(dir === '.' ? [] : dir.split('/')), PACKAGE_JSON);
}

/**
 * Rewrites an internal dependency range onto the released version, preserving
 * the author's range operator.
 *
 * `workspace:` protocol specifiers are not publishable, so they always become a
 * concrete range; `workspace:*` means "whatever ships alongside me", which is a
 * caret range on the released version.
 */
function nextRange(current: string, released: string): string {
  if (current.startsWith('workspace:')) {
    const suffix = current.slice('workspace:'.length);
    if (suffix === '*' || suffix === '') { return `^${released}`; }
    if (suffix === '^' || suffix === '~') { return `${suffix}${released}`; }
    return released;
  }
  if (current.startsWith('link:') || current.startsWith('file:')) { return `^${released}`; }
  const operator = /^[\^~]/.exec(current)?.[0] ?? '';
  return `${operator}${released}`;
}

export interface BuildMutationPlanOptions {
  /**
   * Changelog bytes the plan froze, keyed by worktree-relative path. The intent
   * contract carries only a digest of the mutation set, so the bytes themselves
   * are supplied alongside it; `mutationSha256` then covers their hash, which is
   * what makes a swapped changelog detectable.
   */
  changelogs?: Record<string, string>;
}

/**
 * Derives the exact mutation set for an intent. Pure: reads the worktree, writes nothing.
 */
export function buildMutationPlan(
  worktreePath: string,
  intent: CandidateReleaseIntent,
  options: BuildMutationPlanOptions = {},
): MutationPlan {
  const workspace = discoverWorkspacePackages(worktreePath);
  const byName = new Map(workspace.map(pkg => [pkg.name, pkg] as const));
  const released = new Map(intent.packageSet.map(entry => [entry.name, entry.version] as const));

  const versions: VersionMutation[] = [];
  for (const entry of [...intent.packageSet].sort((left, right) => left.name.localeCompare(right.name))) {
    const pkg = byName.get(entry.name);
    if (!pkg) {
      throw new Error(`intent plans ${entry.name}, which does not exist at the planned commit`);
    }
    versions.push({ dir: pkg.dir, name: pkg.name, from: pkg.version, to: entry.version });
  }

  // Dependency rewrites cover the *whole* workspace, not just the released set:
  // a package outside this flow can still depend on a released one, and leaving
  // it on a stale range would ship an unsatisfiable graph.
  const dependencies: DependencyMutation[] = [];
  for (const pkg of workspace) {
    const manifest = readManifest(worktreePath, pkg.dir);
    for (const section of DEPENDENCY_SECTIONS) {
      const deps = manifest[section] as Record<string, string> | undefined;
      if (!deps) { continue; }
      for (const dependency of Object.keys(deps).sort()) {
        const version = released.get(dependency);
        const current = deps[dependency];
        if (version === undefined || typeof current !== 'string') { continue; }
        const to = nextRange(current, version);
        if (to === current) { continue; }
        dependencies.push({ dir: pkg.dir, section, dependency, from: current, to });
      }
    }
  }

  const changelogs: ChangelogMutation[] = Object.keys(options.changelogs ?? {}).sort().map(path => {
    const content = options.changelogs![path]!;
    return { path, sha256: sha256Text(content), bytes: Buffer.byteLength(content) };
  });

  return { schema: 'kb.release-mutation/1', versions, dependencies, changelogs };
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function mutationSha256(plan: MutationPlan): string {
  return canonicalSha256(plan);
}

/**
 * Applies a plan to the worktree.
 *
 * Rewrites the whole `package.json` object rather than patching text, so the
 * result is a function of the parsed manifest only — two staging runs from the
 * same commit produce byte-identical files, which is what makes the sealed
 * bundle reproducible.
 */
export function applyMutationPlan(
  worktreePath: string,
  plan: MutationPlan,
  changelogs: Record<string, string> = {},
): void {
  const dirs = new Set<string>([
    ...plan.versions.map(mutation => mutation.dir),
    ...plan.dependencies.map(mutation => mutation.dir),
  ]);

  for (const dir of [...dirs].sort()) {
    const manifest = readManifest(worktreePath, dir);
    for (const mutation of plan.versions.filter(item => item.dir === dir)) {
      manifest.version = mutation.to;
    }
    for (const mutation of plan.dependencies.filter(item => item.dir === dir)) {
      const section = manifest[mutation.section] as Record<string, string> | undefined;
      if (section && section[mutation.dependency] === mutation.from) {
        section[mutation.dependency] = mutation.to;
      }
    }
    writeFileSync(manifestPath(worktreePath, dir), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  for (const changelog of plan.changelogs) {
    const content = changelogs[changelog.path];
    if (content === undefined) {
      throw new Error(`mutation plan expects changelog bytes for ${changelog.path} but none were supplied`);
    }
    if (sha256Text(content) !== changelog.sha256) {
      throw new Error(`changelog bytes for ${changelog.path} do not match the digest the intent was signed over`);
    }
    writeFileSync(join(worktreePath, ...changelog.path.split('/')), content);
  }
}

/**
 * Rejects a mutation set the intent was not signed over.
 *
 * This is the whole reason `mutationSha256` exists in the intent contract: the
 * package set alone does not say what will be edited, and staging must not be
 * free to decide that on its own.
 */
export function assertMutationPlanMatchesIntent(plan: MutationPlan, intent: CandidateReleaseIntent): void {
  const actual = mutationSha256(plan);
  if (actual !== intent.mutationSha256) {
    throw new Error(
      `staged mutation set ${actual} does not match the intent's mutationSha256 ${intent.mutationSha256}: `
      + 'the planned commit no longer produces the mutations this intent was signed over',
    );
  }
}
