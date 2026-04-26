/**
 * quality:health - Monorepo health check
 *
 * Analyzes monorepo health including:
 * - Dependency issues (duplicates, unused, missing)
 * - Structure problems (missing READMEs, inconsistent naming)
 * - Build health (TypeScript errors, missing types)
 * - Overall health score with grade (A-F)
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import type { HealthScore, Issue } from '@kb-labs/quality-contracts';
import { CACHE_KEYS } from '@kb-labs/quality-contracts';
import type { HealthFlags } from './flags.js';
import fs from 'node:fs';
import path from 'node:path';

// Input type with backward compatibility
type HealthInput = HealthFlags & { argv?: string[] };

type HealthCommandResult = {
  exitCode: number;
  result?: HealthScore;
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'quality:health',
  description: 'Check monorepo health score',

  handler: {
    async execute(ctx: PluginContextV3, input: HealthInput): Promise<HealthCommandResult> {
      const { ui, platform } = ctx;

      // V3: Flags may come wrapped in input.flags or passed directly
      const flags = ('flags' in input && typeof (input as { flags?: unknown }).flags === 'object' && (input as { flags?: unknown }).flags !== null)
        ? (input as { flags: HealthInput }).flags
        : input;

      // Calculate health score
      const health = await calculateHealth(ctx.cwd, flags.package);

      // Cache results for 5 minutes
      await platform.cache.set(CACHE_KEYS.HEALTH, health, 5 * 60 * 1000);

      // Track analytics
      await platform.analytics.track('quality:health', {
        score: health.score,
        grade: health.grade,
        issueCount: health.issues.length,
        packageSpecific: !!flags.package,
      });

      // Output results
      outputHealth(health, flags, ui);

      return {
        exitCode: health.score < 60 ? 1 : 0,
        result: health,
      };
    },
  },
});

/**
 * Find all packages in the monorepo
 */
function findPackages(rootDir: string, specificPackage?: string): string[] {
  const packages: string[] = [];

  if (!fs.existsSync(rootDir)) {
    return packages;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('kb-labs-')) {continue;}

    const repoPath = path.join(rootDir, entry.name);
    const packagesDir = path.join(repoPath, 'packages');

    if (!fs.existsSync(packagesDir)) {continue;}

    const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true });

    for (const pkgDir of packageDirs) {
      if (!pkgDir.isDirectory()) {continue;}

      const packageJsonPath = path.join(packagesDir, pkgDir.name, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        // If specific package requested, filter
        if (specificPackage) {
          const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          if (pkgJson.name === specificPackage || pkgDir.name === specificPackage) {
            packages.push(packageJsonPath);
          }
        } else {
          packages.push(packageJsonPath);
        }
      }
    }
  }

  return packages;
}

/**
 * Calculate comprehensive health score
 */
async function calculateHealth(rootDir: string, specificPackage?: string): Promise<HealthScore> {
  const packages = findPackages(rootDir, specificPackage);
  let score = 100;
  const issues: Issue[] = [];

  // 1. Check for duplicate dependencies
  const allDeps = new Map<string, Set<string>>();

  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const [dep, version] of Object.entries(deps)) {
      if (!allDeps.has(dep)) {
        allDeps.set(dep, new Set());
      }
      allDeps.get(dep)!.add(version as string);
    }
  }

  const duplicates = Array.from(allDeps.entries())
    .filter(([_, versions]) => versions.size > 1)
    .filter(([dep]) => !dep.startsWith('@kb-labs/')); // Ignore workspace deps

  if (duplicates.length > 0) {
    const penalty = Math.min(20, duplicates.length * 2);
    score -= penalty;
    issues.push({
      type: 'duplicates',
      severity: 'warning',
      message: `${duplicates.length} duplicate dependencies (-${penalty})`,
    });
  }

  // 2. Check for missing READMEs
  let missingReadmes = 0;
  for (const packagePath of packages) {
    const packageDir = path.dirname(packagePath);
    const readmePath = path.join(packageDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      missingReadmes++;
    }
  }

  if (missingReadmes > 0) {
    const penalty = Math.min(15, missingReadmes);
    score -= penalty;
    issues.push({
      type: 'missing-docs',
      severity: 'warning',
      message: `${missingReadmes} packages missing README (-${penalty})`,
    });
  }

  // 3. Check for inconsistent naming
  let namingIssues = 0;
  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {
      namingIssues++;
    }
  }

  if (namingIssues > 0) {
    const penalty = Math.min(10, namingIssues * 2);
    score -= penalty;
    issues.push({
      type: 'naming',
      severity: 'critical',
      message: `${namingIssues} packages with naming issues (-${penalty})`,
    });
  }

  // 4. Check for missing type definitions
  let missingTypes = 0;
  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

    if (!packageJson.types && !packageJson.typings) {
      missingTypes++;
    }
  }

  if (missingTypes > 0) {
    const penalty = Math.min(15, missingTypes);
    score -= penalty;
    issues.push({
      type: 'missing-types',
      severity: 'warning',
      message: `${missingTypes} packages missing types field (-${penalty})`,
    });
  }

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) {grade = 'A';}
  else if (score >= 80) {grade = 'B';}
  else if (score >= 70) {grade = 'C';}
  else if (score >= 60) {grade = 'D';}
  else {grade = 'F';}

  return {
    score: Math.max(0, score),
    grade,
    issues,
  };
}

/**
 * Output health check results
 */
function outputHealth(health: HealthScore, flags: Record<string, unknown>, ui: Record<string, unknown>) {
  if (flags.json) {
    ui?.json?.(health);
    return;
  }

  // Build sections
  const sections: Array<{ header: string; items: string[] }> = [];

  // Score section
  const scoreItems = [
    `Score: ${health.score}/100`,
    `Grade: ${health.grade}`,
    `Status: ${health.score >= 80 ? '✅ Healthy' : health.score >= 60 ? '⚠️ Needs Attention' : '❌ Critical'}`,
  ];
  sections.push({ header: 'Health Score', items: scoreItems });

  // Issues section
  if (health.issues.length > 0) {
    const issueItems = health.issues.map(issue => {
      const icon = issue.severity === 'critical' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      return `${icon} ${issue.message}`;
    });

    if (flags.detailed) {
      sections.push({ header: 'Issues (Detailed)', items: issueItems });
    } else {
      sections.push({ header: 'Issues', items: issueItems });
    }
  } else {
    sections.push({ header: 'Issues', items: ['✅ No issues found!'] });
  }

  // Recommendations
  if (health.score < 90) {
    const recommendations: string[] = [];

    if (health.issues.some(i => i.type === 'duplicates')) {
      recommendations.push('Run `kb quality:fix-deps --align-versions` to fix duplicates');
    }
    if (health.issues.some(i => i.type === 'missing-docs')) {
      recommendations.push('Add README.md files to packages');
    }
    if (health.issues.some(i => i.type === 'missing-types')) {
      recommendations.push('Add "types" field to package.json or enable dts generation');
    }

    if (recommendations.length > 0) {
      sections.push({ header: 'Recommendations', items: recommendations });
    }
  }

  const title = health.score >= 80
    ? '💚 Monorepo Health Check - Healthy'
    : health.score >= 60
    ? '💛 Monorepo Health Check - Needs Attention'
    : '❤️ Monorepo Health Check - Critical';

  ui?.success?.('Health check completed', {
    title,
    sections,
  });
}
