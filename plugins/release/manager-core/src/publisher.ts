/**
 * Publisher - handles package publishing and changelog updates
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageVersion, ReleasePlan } from './types';
import type { ShellAPI } from '@kb-labs/sdk';
import { createExecaShellAdapter } from './shell-adapter';
import { rewriteWorkspaceDeps } from './dep-rewrite';
import { updateCheckpointGitRoot, markCheckpointComplete } from './checkpoint';

export interface PublisherOptions {
  cwd: string;
  plan: ReleasePlan;
  dryRun?: boolean;
  shell?: ShellAPI;
  config?: import('./types').ReleaseConfig;
}

export interface PublishingResult {
  published: string[];
  skipped: string[];
  errors: string[];
  versionUpdates: Array<{
    package: string;
    from: string;
    to: string;
    updated: boolean;
  }>;
}

/**
 * Publish packages according to plan
 */
export async function publishPackages(options: PublisherOptions): Promise<PublishingResult> {
  const { plan, dryRun, shell } = options;
  const shellApi = shell || createExecaShellAdapter();
  const result: PublishingResult = {
    published: [],
    skipped: [],
    errors: [],
    versionUpdates: [],
  };

  if (dryRun) {
    // In dry-run, just report what would be published
    for (const pkg of plan.packages) {
      result.skipped.push(`${pkg.name}@${pkg.nextVersion} (dry-run)`);
      // Record planned version update (not applied)
      result.versionUpdates.push({
        package: pkg.name,
        from: pkg.currentVersion || 'unknown',
        to: pkg.nextVersion || 'unknown',
        updated: false,
      });
    }
    return result;
  }

  const pm = options.config?.publish?.packageManager ?? 'pnpm';
  const versionMap = new Map(plan.packages.map(p => [p.name, p.nextVersion]));

  // Publish each package
  for (const pkg of plan.packages) {
    try {
      const registry = plan.registry || 'https://registry.npmjs.org';

      // 1. Update version in package.json BEFORE publishing
      try {
        await updatePackageVersion(pkg);
        result.versionUpdates.push({
          package: pkg.name,
          from: pkg.currentVersion || 'unknown',
          to: pkg.nextVersion || 'unknown',
          updated: true,
        });
      } catch (versionError) {
        const msg = `Failed to update version for ${pkg.name}: ${versionError instanceof Error ? versionError.message : String(versionError)}`;
        result.errors.push(msg);
        result.versionUpdates.push({
          package: pkg.name,
          from: pkg.currentVersion || 'unknown',
          to: pkg.nextVersion || 'unknown',
          updated: false,
        });
        continue; // Skip publish if version update failed
      }

      // 2. Rewrite workspace:/link: deps for non-pnpm package managers
      // pnpm handles workspace:* natively; npm/yarn require explicit rewrite.
      const restoreDeps = rewriteWorkspaceDeps(pkg.path, versionMap, pm);

      // 3. Publish to npm
      const access = options.config?.publish?.access ?? 'public';
      let publishResult;
      try {
        publishResult = await shellApi.exec(
          pm,
          ['publish', '--access', access, '--registry', registry],
          { cwd: pkg.path, timeout: 60000 }
        );
      } finally {
        restoreDeps();
      }

      if (publishResult.ok) {
        result.published.push(`${pkg.name}@${pkg.nextVersion}`);
      } else {
        const errorDetails = publishResult.stderr || publishResult.stdout || 'Unknown error';
        result.errors.push(`Failed to publish ${pkg.name}: ${errorDetails}`);
      }
    } catch (error) {
      const msg = `Failed to publish ${pkg.name}: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(msg);
    }
  }

  return result;
}

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
 * Generate changelog entry for release
 * Note: This is a simplified wrapper. Full changelog generation is handled by @kb-labs/release-manager-changelog
 */
export async function generateChangelog(options: {
  cwd: string;
  plan: ReleasePlan;
}): Promise<string> {
  const { cwd, plan } = options;
  
  const changelogPath = join(cwd, 'CHANGELOG.md');
  let existingChangelog = '';
  
  try {
    existingChangelog = await readFile(changelogPath, 'utf-8');
  } catch {
    // Changelog doesn't exist yet
  }

  const date = new Date().toISOString().split('T')[0];
  const header = `## [${date}] Release\n\n`;
  
  const entries: string[] = [];
  for (const pkg of plan.packages) {
    entries.push(`- **${pkg.name}**: ${pkg.currentVersion} → ${pkg.nextVersion}`);
  }
  
  const newEntry = header + entries.join('\n') + '\n\n';
  
  // Prepend to existing changelog
  const updatedChangelog = newEntry + existingChangelog;
  
  // Write back
  try {
    await mkdir(join(cwd, '.kb', 'release'), { recursive: true });
    await writeFile(changelogPath, updatedChangelog, 'utf-8');
  } catch (error) {
    console.warn(`Failed to write changelog: ${error instanceof Error ? error.message : String(error)}`);
  }

  return newEntry;
}

/**
 * Generate enhanced changelog using @kb-labs/release-manager-changelog
 * This is the recommended approach for full-featured changelog generation
 *
 * Note: Full integration available via @kb-labs/release-manager-changelog package and CLI command
 */
export async function generateEnhancedChangelog(options: {
  cwd: string;
  plan: ReleasePlan;
  from?: string;
  to?: string;
  config?: import('./types').ReleaseConfig;
}): Promise<{ changelog: string; manifest: unknown }> {
  // Full changelog generation is available via @kb-labs/release-manager-changelog
  // For now, fallback to simple changelog
  const simpleChangelog = await generateChangelog({
    cwd: options.cwd,
    plan: options.plan,
  });

  return {
    changelog: simpleChangelog,
    manifest: null,
  };
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

  for (const pkg of plan.packages) {
    try {
      // For single-package releases, use the entire changelog
      // For multi-package releases, extract package-specific section
      let packageChangelog: string;

      if (plan.packages.length === 1) {
        // Single package release: use entire changelog as-is
        packageChangelog = changelog;
      } else {
        // Multi-package release: extract section for this package
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

      // Check if this version already exists in changelog to avoid duplicates
      const versionPattern = new RegExp(
        `^##\\s+${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${pkg.nextVersion.replace(/\./g, '\\.')}`,
        'm'
      );

      let updatedChangelog: string;
      if (existingChangelog && versionPattern.test(existingChangelog)) {
        // Version already exists - replace the section instead of prepending
        // Find where current version section starts and next section begins
        const lines = existingChangelog.split('\n');
        let startIdx = -1;
        let endIdx = lines.length;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && versionPattern.test(line)) {
            startIdx = i;
          } else if (startIdx !== -1 && line && /^##\s+@?[\w-]+/.test(line)) {
            // Found next section header
            endIdx = i;
            break;
          }
        }

        if (startIdx !== -1) {
          // Replace the existing section
          const before = lines.slice(0, startIdx).join('\n');
          const after = lines.slice(endIdx).join('\n');
          updatedChangelog = (before ? before + '\n' : '') + packageChangelog + (after ? '\n' + after : '');
        } else {
          // Fallback: just use new changelog
          updatedChangelog = packageChangelog;
        }
      } else {
        // Prepend new entry
        updatedChangelog = packageChangelog + (existingChangelog ? '\n' + existingChangelog : '');
      }

      await writeFile(changelogPath, updatedChangelog.trim() + '\n', 'utf-8');
    } catch (error) {
      console.warn(`Failed to write changelog for ${pkg.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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
    const pushTagsOptions = noVerify ? ['--no-verify'] : undefined;

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

      // 3. Push
      if (rootCommitted) { await rootGit.push(pushFlags); }
      await rootGit.pushTags(pushTagsOptions);

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

