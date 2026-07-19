/**
 * Publisher - handles package publishing and changelog updates
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageVersion, ReleasePlan } from './types';
import { updateCheckpointGitRoot, markCheckpointComplete } from './checkpoint';

/**
 * Update package.json version to nextVersion
 * Should be called BEFORE generating changelog so versions match
 */
export async function updatePackageVersion(pkg: PackageVersion): Promise<void> {
  const packageJsonPath = join(pkg.path, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

  packageJson.version = pkg.nextVersion;

  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
}

/**
 * Update versions for all packages in the plan
 */
export async function updatePackageVersions(plan: ReleasePlan): Promise<Array<{
  package: string;
  from: string;
  to: string;
  updated: boolean;
}>> {
  const results: Array<{
    package: string;
    from: string;
    to: string;
    updated: boolean;
  }> = [];

  for (const pkg of plan.packages) {
    try {
      await updatePackageVersion(pkg);
      results.push({
        package: pkg.name,
        from: pkg.currentVersion || 'unknown',
        to: pkg.nextVersion || 'unknown',
        updated: true,
      });
    } catch (error) {
      console.warn(`Failed to update version for ${pkg.name}: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        package: pkg.name,
        from: pkg.currentVersion || 'unknown',
        to: pkg.nextVersion || 'unknown',
        updated: false,
      });
    }
  }

  return results;
}

/**
 * Copy changelog to each package directory
 * This writes CHANGELOG.md per package with proper header
 */
export async function copyChangelogToPackages(options: {
  cwd: string;
  plan: ReleasePlan;
  changelog: string;
}): Promise<void> {
  const { plan, changelog } = options;

  // Lockstep releases render ONE consolidated changelog for the whole release
  // (header `## [version] - date`, no per-package sections) — there is no
  // per-package excerpt to extract, so every package gets the same full text,
  // same as the single-package case.
  const uniqueVersions = new Set(plan.packages.map(p => p.nextVersion));
  const isLockstep = plan.packages.length > 1 && uniqueVersions.size === 1;

  for (const pkg of plan.packages) {
    try {
      // For single-package or lockstep releases, use the entire changelog.
      // For independent multi-package releases, extract the package-specific
      // section (headers of the form `## @scope/pkg X.Y.Z`).
      let packageChangelog: string;

      if (plan.packages.length === 1 || isLockstep) {
        packageChangelog = changelog;
      } else {
        packageChangelog = createPackageChangelog(pkg, changelog);
      }

      if (!packageChangelog || packageChangelog.trim().length === 0) {
        console.warn(`No changelog content for ${pkg.name}, skipping`);
        continue;
      }

      // Write to package directory
      const changelogPath = join(pkg.path, 'CHANGELOG.md');

      // Read existing changelog if exists
      let existingChangelog = '';
      try {
        existingChangelog = await readFile(changelogPath, 'utf-8');
      } catch {
        // No existing changelog, start fresh
      }

      // Check if this version already exists in changelog to avoid duplicates.
      // Lockstep headers are `## [X.Y.Z] - date`; independent/single-package
      // headers are `## @scope/pkg X.Y.Z`.
      const versionPattern = isLockstep
        ? new RegExp(`^##\\s+\\[${pkg.nextVersion.replace(/\./g, '\\.')}\\]`, 'm')
        : new RegExp(
            `^##\\s+${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${pkg.nextVersion.replace(/\./g, '\\.')}`,
            'm'
          );

      const updatedChangelog = mergeChangelogBlock(existingChangelog, packageChangelog, versionPattern);

      await writeFile(changelogPath, updatedChangelog.trim() + '\n', 'utf-8');
    } catch (error) {
      console.warn(`Failed to write changelog for ${pkg.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Matches either header shape as a section boundary: `## @scope/pkg X.Y.Z`
// (independent) or `## [X.Y.Z] - date` (lockstep).
const NEXT_SECTION_PATTERN = /^##\s+((@[\w-]+\/)?[\w-]+\s+\d|\[\d)/;

/**
 * Merge a new version-block changelog entry into an existing changelog's
 * content: replace an existing block with the same version (idempotent
 * retry/promote) or prepend it as the newest entry — never blindly overwrite
 * the rest of the file's history.
 */
function mergeChangelogBlock(existingChangelog: string, newBlock: string, versionPattern: RegExp): string {
  if (existingChangelog && versionPattern.test(existingChangelog)) {
    // Version already exists - replace the section instead of prepending.
    // Find where the current version section starts and the next begins.
    const lines = existingChangelog.split('\n');
    let startIdx = -1;
    let endIdx = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && versionPattern.test(line)) {
        startIdx = i;
      } else if (startIdx !== -1 && line && NEXT_SECTION_PATTERN.test(line)) {
        endIdx = i;
        break;
      }
    }

    if (startIdx !== -1) {
      const before = lines.slice(0, startIdx).join('\n');
      const after = lines.slice(endIdx).join('\n');
      return (before ? before + '\n' : '') + newBlock + (after ? '\n' + after : '');
    }
    return newBlock;
  }

  // Prepend new entry
  return newBlock + (existingChangelog ? '\n' + existingChangelog : '');
}

/**
 * Merge the generated changelog for this release into the repo-root
 * `.kb/release/CHANGELOG.md`, prepending/deduplicating the same way
 * `copyChangelogToPackages` does for per-package changelogs — this file is
 * cumulative history, not a per-run snapshot, so it must never be overwritten.
 */
export async function mergeRootChangelog(options: {
  repoRoot: string;
  plan: ReleasePlan;
  changelog: string;
}): Promise<void> {
  const { repoRoot, plan, changelog } = options;
  if (!changelog || changelog.trim().length === 0 || plan.packages.length === 0) {
    return;
  }

  const primary = plan.packages[0]!;
  const uniqueVersions = new Set(plan.packages.map(p => p.nextVersion));
  const isLockstep = plan.packages.length > 1 && uniqueVersions.size === 1;

  const versionPattern = isLockstep
    ? new RegExp(`^##\\s+\\[${primary.nextVersion.replace(/\./g, '\\.')}\\]`, 'm')
    : new RegExp(
        `^##\\s+${primary.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${primary.nextVersion.replace(/\./g, '\\.')}`,
        'm'
      );

  const releaseDir = join(repoRoot, '.kb', 'release');
  const changelogPath = join(releaseDir, 'CHANGELOG.md');

  let existingChangelog = '';
  try {
    existingChangelog = await readFile(changelogPath, 'utf-8');
  } catch {
    // No existing root changelog, start fresh
  }

  const updatedChangelog = mergeChangelogBlock(existingChangelog, changelog.trim(), versionPattern);

  await mkdir(releaseDir, { recursive: true });
  await writeFile(changelogPath, updatedChangelog.trim() + '\n', 'utf-8');
}

/**
 * Create package-specific changelog entry with proper header
 */
function createPackageChangelog(pkg: PackageVersion, changelog: string): string {
  // Extract ONLY the section for this package from the full changelog
  // Format: ## @scope/package-name X.Y.Z
  const packageHeaderPattern = new RegExp(
    `^##\\s+${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+\\.\\d+\\.\\d+`,
    'gm'
  );

  const allHeaders = Array.from(changelog.matchAll(/^##\s+(@[\w-]+\/)?[\w-]+\s+\d+\.\d+\.\d+/gm));

  // Find start index for this package
  let startIdx = -1;
  let endIdx = changelog.length;

  for (let i = 0; i < allHeaders.length; i++) {
    const match = allHeaders[i];
    if (!match || !match.index) {continue;}

    if (packageHeaderPattern.test(match[0])) {
      startIdx = match.index;
      // Find next package header
      if (i + 1 < allHeaders.length) {
        endIdx = allHeaders[i + 1]!.index!;
      }
      break;
    }
  }

  if (startIdx === -1) {
    // Package section not found in changelog, return empty
    return '';
  }

  // Extract the section for this package
  return changelog.substring(startIdx, endIdx).trim();
}

/**
 * Commit and tag release changes
 *
 * Each package is committed inside its own git repo (supports submodules).
 * After all packages are committed, tags are created in cwd (the monorepo root).
 */
export async function commitAndTagRelease(options: {
  cwd: string;
  plan: ReleasePlan;
  dryRun?: boolean;
  /** Pass --no-verify to git push and pushTags. Default: false — hooks run normally. */
  noVerify?: boolean;
  /** repoRoot for checkpoint updates. If omitted, checkpoint updates are skipped. */
  repoRoot?: string;
  /** Per-root state from checkpoint — skip roots already fully pushed. */
  checkpointGitRoots?: Record<string, { committed: boolean; tagged: string[]; pushed: boolean }>;
}): Promise<{ committed: boolean; tagged: string[]; pushed: boolean }> {
  const { cwd, plan, dryRun, noVerify = false, repoRoot, checkpointGitRoots } = options;
  const simpleGit = (await import('simple-git')).default;

  const result = {
    committed: false,
    tagged: [] as string[],
    pushed: false,
  };

  if (dryRun) {
    return result;
  }

  try {
    const commitMessage = createCommitMessage(plan);

    // Group packages by their git root — populated by planner via revparse.
    // Fallback to pkg.path for safety (e.g. packages planned outside normal flow).
    const pkgToRoot = new Map<string, string>();
    for (const pkg of plan.packages) {
      pkgToRoot.set(pkg.path, pkg.gitRoot || pkg.path);
    }

    const rootToPkgs = new Map<string, typeof plan.packages>();
    for (const pkg of plan.packages) {
      const root = pkgToRoot.get(pkg.path)!;
      const list = rootToPkgs.get(root) ?? [];
      list.push(pkg);
      rootToPkgs.set(root, list);
    }

    const uniqueVersions = new Set(plan.packages.map(p => p.nextVersion));
    const isLockstep = plan.packages.length > 1 && uniqueVersions.size === 1;
    const pushFlags: string[] = noVerify ? ['--no-verify'] : [];

    // Process each git root: commit → tag → push.
    // Skip roots already fully pushed (from checkpoint on retry).
    for (const [root, pkgs] of rootToPkgs) {
      const prior = checkpointGitRoots?.[root];
      if (prior?.pushed) {
        // Already completed in a previous run — collect results and continue.
        result.committed = result.committed || prior.committed;
        result.tagged.push(...prior.tagged.filter(t => !result.tagged.includes(t)));
        result.pushed = true;
        continue;
      }

      const rootGit = simpleGit(root);
      let rootCommitted = prior?.committed ?? false;
      let rootTagged = prior?.tagged ?? [];

      // 1. Commit (skip if already done)
      if (!rootCommitted) {
        const filesToStage: string[] = [];
        for (const pkg of pkgs) {
          const rel = (p: string) => p.startsWith(root + '/') ? p.slice(root.length + 1) : p;
          filesToStage.push(rel(join(pkg.path, 'package.json')));
          const changelogPath = join(pkg.path, 'CHANGELOG.md');
          if (existsSync(changelogPath)) { filesToStage.push(rel(changelogPath)); }
        }

        // The consolidated repo-root changelog (pipeline.ts writes
        // <repoRoot>/.kb/release/CHANGELOG.md directly to disk) lives outside
        // any package path, so the loop above never picks it up — stage it
        // explicitly for whichever git root actually IS repoRoot. Without
        // this it's tracked in git but never committed by a real release,
        // silently reverting to whatever was last committed by hand.
        if (repoRoot && root === repoRoot) {
          const rootChangelogPath = join(repoRoot, '.kb', 'release', 'CHANGELOG.md');
          if (existsSync(rootChangelogPath)) {
            filesToStage.push('.kb/release/CHANGELOG.md');
          }
        }

        await rootGit.add(filesToStage);
        try {
          await rootGit.commit(commitMessage);
          rootCommitted = true;
          result.committed = true;
        } catch (commitError) {
          const msg = commitError instanceof Error ? commitError.message : String(commitError);
          if (!msg.includes('nothing to commit') && !msg.includes('nothing added to commit')) {
            throw commitError;
          }
        }
      } else {
        result.committed = true;
      }

      // 2. Tag (skip if already done)
      if (rootTagged.length === 0) {
        if (isLockstep) {
          const tagName = `v${plan.packages[0]!.nextVersion}`;
          await rootGit.addTag(tagName);
          rootTagged = [tagName];
        } else {
          for (const pkg of pkgs) {
            const tagName = `${pkg.name}@${pkg.nextVersion}`;
            await rootGit.addTag(tagName);
            rootTagged.push(tagName);
          }
        }
        result.tagged.push(...rootTagged);
      } else {
        result.tagged.push(...rootTagged.filter(t => !result.tagged.includes(t)));
      }

      // 3. Push — push the branch, then push ONLY the tag(s) just created in
      // this run. `git push --tags` (the old behavior here) pushes EVERY
      // local tag, including all pre-existing ones — on a repo with a long
      // release history that means dozens of already-remote tags get
      // re-sent and rejected as duplicates, making git report the whole
      // command as failed even though the branch commit and the actual new
      // tag(s) went through fine. Pushing exact refs avoids touching any
      // tag we didn't just create.
      if (rootCommitted) { await rootGit.push(pushFlags); }
      if (rootTagged.length > 0) {
        await rootGit.push(['origin', ...pushFlags, ...rootTagged]);
      }

      // Persist checkpoint after each successful root
      if (repoRoot) {
        updateCheckpointGitRoot(repoRoot, root, {
          committed: rootCommitted,
          tagged: rootTagged,
          pushed: true,
        });
      }
    }
    result.pushed = true;

    if (repoRoot) { markCheckpointComplete(repoRoot); }

  } catch (error) {
    console.error(`Git operations failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  return result;
}

/**
 * Create conventional commit message for release
 */
function createCommitMessage(plan: ReleasePlan): string {
  const lines: string[] = [];

  if (plan.packages.length === 1 && plan.packages[0]) {
    const pkg = plan.packages[0];
    lines.push(`chore(release): publish ${pkg.name}@${pkg.nextVersion}`);
  } else {
    lines.push(`chore(release): publish ${plan.packages.length} packages`);
  }

  lines.push('');

  for (const pkg of plan.packages) {
    lines.push(`- ${pkg.name}@${pkg.nextVersion}`);
  }

  return lines.join('\n');
}

