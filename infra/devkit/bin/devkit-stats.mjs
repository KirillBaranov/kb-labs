#!/usr/bin/env node

/**
 * @kb-labs/devkit - Quick Statistics
 *
 * Generates comprehensive statistics about your monorepo.
 * Perfect for dashboards, metrics, and quick overview.
 *
 * Usage:
 *   kb-devkit-stats              # Show all statistics
 *   kb-devkit-stats --json       # Output JSON
 *   kb-devkit-stats --md         # Output Markdown table
 *   kb-devkit-stats --health     # Show health score
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared package discovery — supports both flat and categorized layouts
import { findPackages } from './lib/find-packages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  if (!options.json && !options.md) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  json: args.includes('--json'),
  md: args.includes('--md'),
  health: args.includes('--health'),
};

/**
 * Calculate package size
 */
function calculateSize(packageDir) {
  const srcDir = path.join(packageDir, 'src');
  if (!fs.existsSync(srcDir)) {
    return { files: 0, lines: 0, bytes: 0 };
  }

  let files = 0;
  let lines = 0;
  let bytes = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files++;
        const content = fs.readFileSync(fullPath, 'utf-8');
        lines += content.split('\n').length;
        bytes += Buffer.byteLength(content, 'utf-8');
      }
    }
  }

  walk(srcDir);
  return { files, lines, bytes };
}

/**
 * Collect statistics
 */
function collectStats(packages) {
  const stats = {
    overview: {
      totalPackages: 0,
      totalRepositories: 0,
      totalFiles: 0,
      totalLines: 0,
      totalBytes: 0,
    },
    byRepository: {},
    dependencies: {
      total: 0,
      workspace: 0,
      external: 0,
      duplicates: 0,
    },
    packages: [],
    health: {
      score: 0,
      issues: [],
    },
  };

  const repos = new Set();
  const allDeps = new Map();

  for (const packagePath of packages) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName || !packageName.startsWith('@kb-labs/')) {continue;}

    stats.overview.totalPackages++;

    const repoName = packageName.split('/')[1].split('-')[0];
    repos.add(repoName);

    const packageDir = path.dirname(packagePath);
    const size = calculateSize(packageDir);

    stats.overview.totalFiles += size.files;
    stats.overview.totalLines += size.lines;
    stats.overview.totalBytes += size.bytes;

    // By repository
    if (!stats.byRepository[repoName]) {
      stats.byRepository[repoName] = {
        packages: 0,
        files: 0,
        lines: 0,
        bytes: 0,
      };
    }

    stats.byRepository[repoName].packages++;
    stats.byRepository[repoName].files += size.files;
    stats.byRepository[repoName].lines += size.lines;
    stats.byRepository[repoName].bytes += size.bytes;

    // Dependencies
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    let workspaceDeps = 0;
    let externalDeps = 0;

    for (const [dep, version] of Object.entries(deps)) {
      if (version.startsWith('workspace:') || version.startsWith('link:')) {
        workspaceDeps++;
        stats.dependencies.workspace++;
      } else {
        externalDeps++;
        stats.dependencies.external++;

        // Track for duplicates
        if (!allDeps.has(dep)) {
          allDeps.set(dep, new Set());
        }
        allDeps.get(dep).add(version);
      }
    }

    stats.dependencies.total += Object.keys(deps).length;

    // Health checks
    const hasReadme = fs.existsSync(path.join(packageDir, 'README.md'));
    const hasSrc = fs.existsSync(path.join(packageDir, 'src'));
    const hasTsconfig = fs.existsSync(path.join(packageDir, 'tsconfig.json'));

    stats.packages.push({
      name: packageName,
      repository: repoName,
      files: size.files,
      lines: size.lines,
      bytes: size.bytes,
      dependencies: {
        total: Object.keys(deps).length,
        workspace: workspaceDeps,
        external: externalDeps,
      },
      health: {
        hasReadme,
        hasSrc,
        hasTsconfig,
      },
    });
  }

  stats.overview.totalRepositories = repos.size;

  // Count duplicates
  for (const [dep, versions] of allDeps.entries()) {
    if (versions.size > 1) {
      stats.dependencies.duplicates++;
    }
  }

  // Calculate health score
  stats.health = calculateHealthScore(stats);

  return stats;
}

/**
 * Calculate overall health score
 */
function calculateHealthScore(stats) {
  let score = 100;
  const issues = [];

  // Deduct for duplicates
  if (stats.dependencies.duplicates > 0) {
    const deduction = Math.min(20, stats.dependencies.duplicates * 2);
    score -= deduction;
    issues.push({
      type: 'duplicates',
      severity: 'high',
      message: `${stats.dependencies.duplicates} duplicate dependencies`,
      impact: -deduction,
    });
  }

  // Deduct for missing READMEs
  const missingReadmes = stats.packages.filter((p) => !p.health.hasReadme).length;
  if (missingReadmes > 0) {
    const deduction = Math.min(15, missingReadmes);
    score -= deduction;
    issues.push({
      type: 'documentation',
      severity: 'medium',
      message: `${missingReadmes} packages missing README`,
      impact: -deduction,
    });
  }

  // Deduct for missing src
  const missingSrc = stats.packages.filter((p) => !p.health.hasSrc).length;
  if (missingSrc > 0) {
    const deduction = Math.min(10, missingSrc * 2);
    score -= deduction;
    issues.push({
      type: 'structure',
      severity: 'high',
      message: `${missingSrc} packages missing src directory`,
      impact: -deduction,
    });
  }

  // Bonus for good practices
  if (stats.overview.totalPackages > 50 && score > 80) {
    score = Math.min(100, score + 5);
    issues.push({
      type: 'scale',
      severity: 'info',
      message: 'Well-maintained large monorepo',
      impact: +5,
    });
  }

  return {
    score: Math.max(0, Math.round(score)),
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    issues,
  };
}

/**
 * Format bytes
 */
function formatBytes(bytes) {
  if (bytes === 0) {return '0 B';}
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Print statistics
 */
function printStats(stats) {
  log('\n📊 KB Labs Monorepo Statistics\n', 'bold');

  // Overview
  log('📦 Overview:', 'blue');
  log(`   Packages:      ${stats.overview.totalPackages}`, 'cyan');
  log(`   Repositories:  ${stats.overview.totalRepositories}`, 'cyan');
  log(`   Files:         ${stats.overview.totalFiles.toLocaleString()}`, 'cyan');
  log(`   Lines of Code: ${stats.overview.totalLines.toLocaleString()}`, 'cyan');
  log(`   Total Size:    ${formatBytes(stats.overview.totalBytes)}`, 'cyan');
  log('', 'reset');

  // Dependencies
  log('🔗 Dependencies:', 'blue');
  log(`   Total:         ${stats.dependencies.total.toLocaleString()}`, 'cyan');
  log(`   Workspace:     ${stats.dependencies.workspace.toLocaleString()}`, 'green');
  log(`   External:      ${stats.dependencies.external.toLocaleString()}`, 'yellow');
  if (stats.dependencies.duplicates > 0) {
    log(`   Duplicates:    ${stats.dependencies.duplicates} ⚠️`, 'red');
  } else {
    log(`   Duplicates:    0 ✅`, 'green');
  }
  log('', 'reset');

  // By Repository
  log('📁 By Repository:', 'blue');
  const repos = Object.entries(stats.byRepository).sort((a, b) => b[1].packages - a[1].packages);

  for (const [repo, data] of repos.slice(0, 10)) {
    log(`   ${repo.padEnd(15)} ${data.packages.toString().padStart(3)} pkg  ${data.lines.toLocaleString().padStart(8)} lines`, 'gray');
  }
  log('', 'reset');

  // Health Score
  if (options.health) {
    log('💚 Health Score:', 'blue');
    const scoreColor =
      stats.health.grade === 'A' ? 'green' :
      stats.health.grade === 'B' ? 'cyan' :
      stats.health.grade === 'C' ? 'yellow' : 'red';

    log(`   Score: ${stats.health.score}/100 (Grade ${stats.health.grade})`, scoreColor);

    if (stats.health.issues.length > 0) {
      log('\n   Issues:', 'yellow');
      for (const issue of stats.health.issues) {
        const icon =
          issue.severity === 'high' ? '🔴' :
          issue.severity === 'medium' ? '🟡' : 'ℹ️';
        const impact = issue.impact > 0 ? `+${issue.impact}` : issue.impact;
        log(`   ${icon} ${issue.message} (${impact})`, 'gray');
      }
    }
    log('', 'reset');
  }

  // Top packages
  const largest = stats.packages.sort((a, b) => b.lines - a.lines).slice(0, 5);
  log('📈 Largest Packages:', 'blue');
  for (let i = 0; i < largest.length; i++) {
    const pkg = largest[i];
    log(`   ${i + 1}. ${pkg.name}`, 'yellow');
    log(`      ${pkg.lines.toLocaleString()} lines, ${pkg.files} files`, 'gray');
  }
  log('', 'reset');
}

/**
 * Print Markdown
 */
function printMarkdown(stats) {
  console.log('# KB Labs Monorepo Statistics\n');

  console.log('## Overview\n');
  console.log('| Metric | Value |');
  console.log('|--------|-------|');
  console.log(`| Packages | ${stats.overview.totalPackages} |`);
  console.log(`| Repositories | ${stats.overview.totalRepositories} |`);
  console.log(`| Files | ${stats.overview.totalFiles.toLocaleString()} |`);
  console.log(`| Lines of Code | ${stats.overview.totalLines.toLocaleString()} |`);
  console.log(`| Total Size | ${formatBytes(stats.overview.totalBytes)} |`);
  console.log('');

  console.log('## By Repository\n');
  console.log('| Repository | Packages | Lines | Size |');
  console.log('|------------|----------|-------|------|');

  const repos = Object.entries(stats.byRepository).sort((a, b) => b[1].packages - a[1].packages);
  for (const [repo, data] of repos) {
    console.log(`| ${repo} | ${data.packages} | ${data.lines.toLocaleString()} | ${formatBytes(data.bytes)} |`);
  }
  console.log('');

  if (options.health) {
    console.log('## Health Score\n');
    console.log(`**Score:** ${stats.health.score}/100 (Grade ${stats.health.grade})\n`);

    if (stats.health.issues.length > 0) {
      console.log('### Issues\n');
      for (const issue of stats.health.issues) {
        const emoji = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : 'ℹ️';
        console.log(`- ${emoji} ${issue.message}`);
      }
      console.log('');
    }
  }
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  const packages = findPackages(rootDir);

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    process.exit(0);
  }

  const stats = collectStats(packages);

  if (options.json) {
    console.log(JSON.stringify(stats, null, 2));
  } else if (options.md) {
    printMarkdown(stats);
  } else {
    printStats(stats);
  }

  process.exit(0);
}

main();
