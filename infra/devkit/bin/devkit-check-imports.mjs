#!/usr/bin/env node

/**
 * @kb-labs/devkit - Import Checker
 *
 * Checks for:
 * 1. Broken imports (files that don't exist)
 * 2. Unused dependencies in package.json
 * 3. Imports from node_modules that should be workspace imports
 * 4. Circular dependencies between packages
 *
 * Usage:
 *   kb-devkit-check-imports                    # Check all packages
 *   kb-devkit-check-imports --package cli-core # Check specific package
 *   kb-devkit-check-imports --fix              # Auto-fix unused deps
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared package discovery — supports both flat and categorized layouts
import { findPackages } from './lib/find-packages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Parse .devkitignore file
 * Returns rules grouped by type
 */
function parseDevkitIgnore(rootDir) {
  const ignorePath = path.join(rootDir, '.devkitignore');
  const rules = {
    'missing-dep': [],
    'unused-dep': [],
    'broken-import': [],
    'circular-dep': [],
  };

  if (!fs.existsSync(ignorePath)) {
    return rules;
  }

  const content = fs.readFileSync(ignorePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {continue;}

    // Parse rule: "rule-type: pattern # reason"
    const match = trimmed.match(/^(missing-dep|unused-dep|broken-import|circular-dep):\s*(.+?)(?:\s*#\s*(.*))?$/);
    if (!match) {continue;}

    const [, ruleType, pattern, reason] = match;

    // Parse pattern: "package -> target"
    // Simpler regex: match @scope/package or package, then ->, then target
    const patternMatch = pattern.trim().match(/^(@[\w-]+\/[\w-]+|[\w-]+)\s*->\s*(.+)$/);
    if (!patternMatch) {continue;}

    const [, packageName, target] = patternMatch;

    rules[ruleType].push({
      package: packageName.trim(),
      target: target.trim(),
      reason: reason?.trim() || 'No reason provided',
    });
  }

  return rules;
}

/**
 * Check if an issue should be ignored based on rules
 */
function shouldIgnore(rules, ruleType, packageName, target) {
  const typeRules = rules[ruleType] || [];

  for (const rule of typeRules) {
    if (rule.package !== packageName) {continue;}

    // Handle wildcard patterns
    if (rule.target.includes('*')) {
      const regex = new RegExp('^' + rule.target.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      if (regex.test(target)) {
        return rule;
      }
    } else if (rule.target === target) {
      return rule;
    }
  }

  return null;
}

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
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
  fix: args.includes('--fix'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

/**
 * Extract imports from TypeScript/JavaScript file
 */
function extractImports(filePath, content) {
  const imports = [];

  // Match: import ... from 'module'
  // Match: import('module')
  // Match: require('module')
  const patterns = [
    /import\s+(?:[\w*{}\n\r\t, ]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      imports.push({
        path: importPath,
        line: content.substring(0, match.index).split('\n').length,
      });
    }
  }

  return imports;
}

/**
 * Check if import path is a local file import
 */
function isLocalImport(importPath) {
  return importPath.startsWith('.') || importPath.startsWith('/');
}

/**
 * Check if import path is a node built-in
 */
function isNodeBuiltin(importPath) {
  // If it starts with node:, it's definitely a builtin
  if (importPath.startsWith('node:')) {
    return true;
  }

  const builtins = [
    'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram',
    'dns', 'domain', 'events', 'fs', 'http', 'https', 'net', 'os',
    'path', 'punycode', 'querystring', 'readline', 'repl', 'stream',
    'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8',
    'vm', 'zlib', 'module', 'inspector', 'perf_hooks', 'worker_threads',
    'async_hooks', 'trace_events', 'diagnostics_channel',
  ];

  // Also check for subpaths like fs/promises
  const baseModule = importPath.split('/')[0];
  return builtins.includes(baseModule);
}

/**
 * Resolve import path to actual file
 */
function resolveImport(importPath, sourceFile, packageRoot) {
  if (!isLocalImport(importPath)) {
    return null; // External dependency
  }

  const sourceDir = path.dirname(sourceFile);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

  // Try exact path
  const resolved = path.resolve(sourceDir, importPath);

  // Try with extensions
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return withExt;
    }
  }

  // Try as directory with index file
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const ext of extensions) {
      const indexFile = path.join(resolved, `index${ext}`);
      if (fs.existsSync(indexFile)) {
        return indexFile;
      }
    }
  }

  return null; // Could not resolve
}

/**
 * Find all source files in package
 */
function findSourceFiles(packageDir) {
  const files = [];
  const srcDir = path.join(packageDir, 'src');

  if (!fs.existsSync(srcDir)) {
    return files;
  }

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(srcDir);
  return files;
}

/**
 * Check package for import issues
 */
function checkPackage(packageJsonPath) {
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const packageName = packageJson.name;

  if (!packageName || !packageName.startsWith('@kb-labs/')) {
    return null; // Skip non-KB Labs packages
  }

  const issues = {
    brokenImports: [],
    unusedDeps: [],
    missingWorkspaceDeps: [],
    missingNpmDeps: [],
    usedDeps: new Set(),
  };

  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const sourceFiles = findSourceFiles(packageDir);

  if (sourceFiles.length === 0) {
    return null; // No source files
  }

  // Check each source file
  for (const sourceFile of sourceFiles) {
    const content = fs.readFileSync(sourceFile, 'utf-8');
    const imports = extractImports(sourceFile, content);

    for (const imp of imports) {
      const { path: importPath, line } = imp;

      // Check local imports
      if (isLocalImport(importPath)) {
        const resolved = resolveImport(importPath, sourceFile, packageDir);

        if (!resolved) {
          issues.brokenImports.push({
            file: path.relative(packageDir, sourceFile),
            line,
            import: importPath,
          });
        }
      }
      // Check external dependencies
      else if (!isNodeBuiltin(importPath)) {
        // Extract package name (handle scoped packages and subpaths)
        const match = importPath.match(/^(@[^/]+\/[^/]+|[^/]+)/);
        const depName = match ? match[1] : importPath;

        issues.usedDeps.add(depName);

        // Check if it's a workspace package that should be in dependencies
        if (depName.startsWith('@kb-labs/')) {
          if (!dependencies[depName]) {
            issues.missingWorkspaceDeps.push({
              file: path.relative(packageDir, sourceFile),
              line,
              package: depName,
            });
          }
        }
        // Check if it's a regular npm package that should be in dependencies
        else {
          if (!dependencies[depName]) {
            issues.missingNpmDeps.push({
              file: path.relative(packageDir, sourceFile),
              line,
              package: depName,
            });
          }
        }
      }
    }
  }

  // Find unused dependencies
  const allDeps = Object.keys(dependencies);
  for (const dep of allDeps) {
    // Skip type-only packages and build tools
    if (
      dep.startsWith('@types/') ||
      dep === 'typescript' ||
      dep === 'tsup' ||
      dep === 'vitest' ||
      dep === 'rimraf' ||
      dep === 'eslint' ||
      dep === 'prettier' ||
      dep === '@kb-labs/devkit' ||
      dep.startsWith('eslint-') ||
      dep.startsWith('@vitest/') ||
      dep.startsWith('@testing-library/')
    ) {
      continue;
    }

    if (!issues.usedDeps.has(dep)) {
      issues.unusedDeps.push(dep);
    }
  }

  return {
    packageName,
    packageDir,
    packageJsonPath,
    ...issues,
  };
}

/**
 * Detect circular dependencies between packages
 */
function detectCircularDeps(allResults) {
  const graph = new Map();
  const packagePaths = new Map();

  // Build dependency graph
  for (const result of allResults) {
    if (!result) {continue;}

    const deps = [];
    const packageJson = JSON.parse(fs.readFileSync(result.packageJsonPath, 'utf-8'));
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const dep of Object.keys(allDeps)) {
      if (dep.startsWith('@kb-labs/')) {
        deps.push(dep);
      }
    }

    graph.set(result.packageName, deps);
    packagePaths.set(result.packageName, result.packageDir);
  }

  // Find cycles using DFS
  const cycles = [];
  const visited = new Set();
  const recStack = new Set();

  function dfs(node, path = []) {
    if (recStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      const cycle = [...path.slice(cycleStart), node];
      cycles.push(cycle);
      return;
    }

    if (visited.has(node)) {return;}

    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (graph.has(neighbor)) {
        dfs(neighbor, [...path]);
      }
    }

    recStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  // Remove duplicate cycles
  const uniqueCycles = [];
  const seen = new Set();

  for (const cycle of cycles) {
    const normalized = [...cycle].sort().join('→');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueCycles.push(cycle);
    }
  }

  return uniqueCycles;
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  log('\n🔍 KB Labs Import Checker\n', 'blue');

  // Load ignore rules
  const ignoreRules = parseDevkitIgnore(rootDir);
  const hasIgnoreFile = fs.existsSync(path.join(rootDir, '.devkitignore'));
  const totalIgnoreRules = Object.values(ignoreRules).reduce((sum, arr) => sum + arr.length, 0);

  if (hasIgnoreFile && totalIgnoreRules > 0) {
    log(`Loaded ${totalIgnoreRules} ignore rule(s) from .devkitignore\n`, 'gray');
  }

  if (options.package) {
    log(`Checking package: ${options.package}\n`, 'gray');
  } else {
    log('Checking all packages...\n', 'gray');
  }

  const packages = findPackages(rootDir, options.package);

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    log('   Run this command from the monorepo root\n', 'gray');
    process.exit(0);
  }

  log(`Found ${packages.length} package(s) to check\n`, 'gray');

  const results = [];
  let totalIssues = 0;

  // Check each package
  for (const packagePath of packages) {
    const result = checkPackage(packagePath);
    if (result) {
      results.push(result);

      const issueCount =
        result.brokenImports.length +
        result.unusedDeps.length +
        result.missingWorkspaceDeps.length;

      if (issueCount > 0) {
        totalIssues += issueCount;
      }
    }
  }

  // Detect circular dependencies
  const cycles = detectCircularDeps(results);

  // Track ignored items for summary
  let ignoredBroken = 0;
  let ignoredMissing = 0;
  let ignoredUnused = 0;

  // Print results
  let hasIssues = false;

  for (const result of results) {
    // Filter issues based on ignore rules
    const filteredBroken = result.brokenImports.filter((issue) => {
      const ignored = shouldIgnore(ignoreRules, 'broken-import', result.packageName, issue.import);
      if (ignored) {ignoredBroken++;}
      return !ignored;
    });

    const uniqueMissingDeps = [...new Set(result.missingWorkspaceDeps.map((d) => d.package))];
    const filteredMissingDeps = uniqueMissingDeps.filter((dep) => {
      const ignored = shouldIgnore(ignoreRules, 'missing-dep', result.packageName, dep);
      if (ignored) {ignoredMissing++;}
      return !ignored;
    });

    const uniqueMissingNpmDeps = [...new Set(result.missingNpmDeps.map((d) => d.package))];
    const filteredMissingNpmDeps = uniqueMissingNpmDeps.filter((dep) => {
      const ignored = shouldIgnore(ignoreRules, 'missing-dep', result.packageName, dep);
      if (ignored) {ignoredMissing++;}
      return !ignored;
    });

    const filteredUnused = result.unusedDeps.filter((dep) => {
      const ignored = shouldIgnore(ignoreRules, 'unused-dep', result.packageName, dep);
      if (ignored) {ignoredUnused++;}
      return !ignored;
    });

    const issueCount =
      filteredBroken.length +
      filteredMissingDeps.length +
      filteredMissingNpmDeps.length +
      filteredUnused.length;

    if (issueCount === 0 && !options.verbose) {continue;}

    hasIssues = hasIssues || issueCount > 0;

    if (issueCount > 0) {
      log(`\n❌ ${result.packageName}`, 'red');
      log(`   ${path.relative(rootDir, result.packageDir)}`, 'gray');
    } else if (options.verbose) {
      log(`\n✅ ${result.packageName}`, 'green');
    }

    // Broken imports
    if (filteredBroken.length > 0) {
      log(`\n   🔴 Broken imports (${filteredBroken.length}):`, 'red');
      for (const issue of filteredBroken) {
        log(`      ${issue.file}:${issue.line}`, 'yellow');
        log(`      └─ Cannot resolve: ${issue.import}`, 'gray');
      }
    }

    // Missing workspace dependencies
    if (filteredMissingDeps.length > 0) {
      log(`\n   🟡 Missing workspace dependencies (${filteredMissingDeps.length}):`, 'yellow');
      for (const dep of filteredMissingDeps) {
        const usages = result.missingWorkspaceDeps.filter((d) => d.package === dep);
        log(`      ${dep}`, 'cyan');
        log(`      └─ Used in ${usages.length} file(s)`, 'gray');
        if (options.verbose) {
          for (const usage of usages.slice(0, 3)) {
            log(`         - ${usage.file}:${usage.line}`, 'gray');
          }
          if (usages.length > 3) {
            log(`         ... and ${usages.length - 3} more`, 'gray');
          }
        }
      }
    }

    // Missing npm dependencies
    if (filteredMissingNpmDeps.length > 0) {
      log(`\n   🟡 Missing npm dependencies (${filteredMissingNpmDeps.length}):`, 'yellow');
      for (const dep of filteredMissingNpmDeps) {
        const usages = result.missingNpmDeps.filter((d) => d.package === dep);
        log(`      ${dep}`, 'cyan');
        log(`      └─ Used in ${usages.length} file(s)`, 'gray');
        if (options.verbose) {
          for (const usage of usages.slice(0, 3)) {
            log(`         - ${usage.file}:${usage.line}`, 'gray');
          }
          if (usages.length > 3) {
            log(`         ... and ${usages.length - 3} more`, 'gray');
          }
        }
      }
    }

    // Unused dependencies
    if (filteredUnused.length > 0) {
      log(`\n   🟠 Unused dependencies (${filteredUnused.length}):`, 'yellow');
      for (const dep of filteredUnused) {
        log(`      ${dep}`, 'gray');
      }
      if (options.fix) {
        log(`      💡 Run with --fix to remove unused dependencies`, 'blue');
      }
    }
  }

  // Print circular dependencies
  if (cycles.length > 0) {
    hasIssues = true;
    log(`\n\n🔄 Circular Dependencies (${cycles.length}):\n`, 'magenta');

    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      log(`${i + 1}. ${cycle.join(' → ')}`, 'yellow');
    }

    log('\n   ⚠️  Circular dependencies can cause build and runtime issues', 'gray');
    log('   💡 Consider refactoring to extract shared code into a new package\n', 'gray');
  }

  // Summary
  log('\n' + '─'.repeat(60) + '\n', 'gray');

  if (!hasIssues && cycles.length === 0) {
    log('✅ No import issues found!\n', 'green');
    if (ignoredBroken + ignoredMissing + ignoredUnused > 0) {
      log(`   ℹ️  ${ignoredBroken + ignoredMissing + ignoredUnused} issue(s) ignored via .devkitignore\n`, 'gray');
    }
    process.exit(0);
  }

  log('📊 Summary:\n', 'blue');

  // Calculate filtered counts
  let brokenCount = 0;
  let missingCount = 0;
  let unusedCount = 0;

  for (const result of results) {
    brokenCount += result.brokenImports.filter(
      (issue) => !shouldIgnore(ignoreRules, 'broken-import', result.packageName, issue.import)
    ).length;

    const uniqueDeps = [...new Set(result.missingWorkspaceDeps.map((d) => d.package))];
    missingCount += uniqueDeps.filter(
      (dep) => !shouldIgnore(ignoreRules, 'missing-dep', result.packageName, dep)
    ).length;

    unusedCount += result.unusedDeps.filter(
      (dep) => !shouldIgnore(ignoreRules, 'unused-dep', result.packageName, dep)
    ).length;
  }

  if (brokenCount > 0) {
    log(`   🔴 ${brokenCount} broken import(s)`, 'red');
  }
  if (missingCount > 0) {
    log(`   🟡 ${missingCount} missing workspace dep(s)`, 'yellow');
  }
  if (unusedCount > 0) {
    log(`   🟠 ${unusedCount} unused dependency(ies)`, 'yellow');
  }
  if (cycles.length > 0) {
    log(`   🔄 ${cycles.length} circular dependency cycle(s)`, 'magenta');
  }

  // Show ignored count
  const totalIgnored = ignoredBroken + ignoredMissing + ignoredUnused;
  if (totalIgnored > 0) {
    log(`\n   ℹ️  ${totalIgnored} issue(s) ignored via .devkitignore`, 'gray');
  }

  log('\n💡 Tips:', 'blue');
  log('   • Use --verbose to see all packages (including clean ones)', 'gray');
  log('   • Use --package=<name> to check a specific package', 'gray');
  log('   • Use --fix to auto-remove unused dependencies (coming soon)', 'gray');
  log('   • Add rules to .devkitignore to suppress known issues', 'gray');
  log('');

  process.exit(1);
}

main();
