#!/usr/bin/env node

/**
 * @kb-labs/devkit - Path Validator
 *
 * Validates all paths and references in the monorepo:
 * 1. package.json dependencies pointing to non-existent packages
 * 2. package.json exports pointing to non-existent files
 * 3. package.json bin pointing to non-existent scripts
 * 4. tsconfig.json extends/references pointing to non-existent configs
 * 5. Workspace protocol references to non-existent packages
 *
 * Usage:
 *   kb-devkit-check-paths                    # Check all paths
 *   kb-devkit-check-paths --package=cli-core # Check specific package
 *   kb-devkit-check-paths --fix              # Auto-fix what's possible
 *   kb-devkit-check-paths --json             # JSON output
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared package discovery — supports both flat and categorized layouts
import { findPackages as _findPackagePaths } from './lib/find-packages.mjs';

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
  if (!options.json) {
    console.log(`${colors[color] || colors.reset}${message}${colors.reset}`);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  fix: args.includes('--fix'),
  json: args.includes('--json'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
};

/**
 * Find all packages in monorepo (returns objects with path, dir, repo)
 */
function findPackages(rootDir, filterPackage) {
  return _findPackagePaths(rootDir, filterPackage).map((pkgPath) => {
    const parts = pkgPath.split(path.sep);
    const repo = parts.find((p) => p.startsWith('kb-labs-')) || 'unknown';
    return { path: pkgPath, dir: path.dirname(pkgPath), repo };
  });
}

/**
 * Get all workspace package names
 */
function getWorkspacePackageNames(packages) {
  const names = new Set();

  for (const pkg of packages) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(pkg.path, 'utf-8'));
      if (packageJson.name) {
        names.add(packageJson.name);
      }
    } catch {
      // Skip invalid package.json
    }
  }

  return names;
}

/**
 * Check if a path exists (file or directory)
 */
function pathExists(basePath, relativePath) {
  const fullPath = path.resolve(basePath, relativePath);

  // Try exact path
  if (fs.existsSync(fullPath)) {
    return { exists: true, resolved: fullPath };
  }

  // Try with common extensions
  const extensions = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.d.ts'];
  for (const ext of extensions) {
    if (fs.existsSync(fullPath + ext)) {
      return { exists: true, resolved: fullPath + ext };
    }
  }

  // Try index files
  const indexFiles = ['index.js', 'index.mjs', 'index.ts', 'index.tsx'];
  for (const indexFile of indexFiles) {
    const indexPath = path.join(fullPath, indexFile);
    if (fs.existsSync(indexPath)) {
      return { exists: true, resolved: indexPath };
    }
  }

  return { exists: false, resolved: fullPath };
}

/**
 * Check package.json dependencies
 */
function checkDependencies(packageJson, packageDir, workspaceNames) {
  const issues = [];

  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  };

  for (const [dep, version] of Object.entries(allDeps)) {
    // Check workspace: protocol references
    if (version.startsWith('workspace:')) {
      if (dep.startsWith('@kb-labs/') && !workspaceNames.has(dep)) {
        issues.push({
          type: 'missing_workspace_package',
          severity: 'error',
          path: `dependencies.${dep}`,
          message: `Workspace package "${dep}" does not exist in monorepo`,
          value: version,
        });
      }
    }

    // Check link: protocol references
    if (version.startsWith('link:')) {
      const linkPath = version.replace('link:', '');
      const { exists } = pathExists(packageDir, linkPath);

      if (!exists) {
        issues.push({
          type: 'broken_link',
          severity: 'error',
          path: `dependencies.${dep}`,
          message: `Link path does not exist: ${linkPath}`,
          value: version,
        });
      }
    }

    // Check file: protocol references
    if (version.startsWith('file:')) {
      const filePath = version.replace('file:', '');
      const { exists } = pathExists(packageDir, filePath);

      if (!exists) {
        issues.push({
          type: 'broken_file_ref',
          severity: 'error',
          path: `dependencies.${dep}`,
          message: `File path does not exist: ${filePath}`,
          value: version,
        });
      }
    }
  }

  return issues;
}

/**
 * Check package.json exports
 */
function checkExports(packageJson, packageDir) {
  const issues = [];

  if (!packageJson.exports) {return issues;}

  function checkExportPath(exportKey, exportValue, parentPath = 'exports') {
    if (typeof exportValue === 'string') {
      // Skip conditions like "import", "require", "types", "default"
      if (exportValue.startsWith('./') || exportValue.startsWith('../')) {
        // Skip glob patterns (e.g., ./dist/*)
        if (exportValue.includes('*')) {return;}

        const { exists } = pathExists(packageDir, exportValue);

        if (!exists) {
          // Check if it's a dist file (expected to not exist before build)
          const isDist = exportValue.includes('/dist/') || exportValue.startsWith('./dist/');

          issues.push({
            type: 'broken_export',
            severity: isDist ? 'warning' : 'error',
            path: `${parentPath}["${exportKey}"]`,
            message: `Export path does not exist: ${exportValue}${isDist ? ' (needs build)' : ''}`,
            value: exportValue,
          });
        }
      }
    } else if (typeof exportValue === 'object' && exportValue !== null) {
      // Handle conditional exports
      for (const [key, value] of Object.entries(exportValue)) {
        checkExportPath(key, value, `${parentPath}["${exportKey}"]`);
      }
    }
  }

  for (const [key, value] of Object.entries(packageJson.exports)) {
    checkExportPath(key, value);
  }

  return issues;
}

/**
 * Check package.json bin
 */
function checkBin(packageJson, packageDir) {
  const issues = [];

  if (!packageJson.bin) {return issues;}

  const bins = typeof packageJson.bin === 'string'
    ? { [packageJson.name]: packageJson.bin }
    : packageJson.bin;

  for (const [binName, binPath] of Object.entries(bins)) {
    const { exists } = pathExists(packageDir, binPath);

    if (!exists) {
      issues.push({
        type: 'broken_bin',
        severity: 'error',
        path: `bin["${binName}"]`,
        message: `Bin script does not exist: ${binPath}`,
        value: binPath,
      });
    }
  }

  return issues;
}

/**
 * Check package.json main, module, types fields
 */
function checkEntryPoints(packageJson, packageDir) {
  const issues = [];

  const entryFields = ['main', 'module', 'types', 'typings', 'browser'];

  for (const field of entryFields) {
    if (packageJson[field]) {
      const { exists } = pathExists(packageDir, packageJson[field]);

      if (!exists) {
        // Check if it's a dist file that might not exist yet
        const isDist = packageJson[field].includes('/dist/') || packageJson[field].startsWith('dist/');

        issues.push({
          type: 'broken_entry_point',
          severity: isDist ? 'warning' : 'error',
          path: field,
          message: `Entry point does not exist: ${packageJson[field]}${isDist ? ' (may need build)' : ''}`,
          value: packageJson[field],
        });
      }
    }
  }

  return issues;
}

/**
 * Check tsconfig.json
 */
function checkTsconfig(packageDir) {
  const issues = [];
  const tsconfigPath = path.join(packageDir, 'tsconfig.json');

  if (!fs.existsSync(tsconfigPath)) {return issues;}

  try {
    const content = fs.readFileSync(tsconfigPath, 'utf-8');
    // Remove comments for JSON parsing (but not // inside strings)
    // Only remove // comments that are not inside quotes
    const cleanContent = content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/^(\s*)\/\/.*$/gm, '$1'); // Remove // comments at start of lines only
    const tsconfig = JSON.parse(cleanContent);

    // Check extends (can be string or array in TS 5.0+)
    if (tsconfig.extends) {
      const extendsList = Array.isArray(tsconfig.extends)
        ? tsconfig.extends
        : [tsconfig.extends];

      for (let i = 0; i < extendsList.length; i++) {
        const extendsPath = extendsList[i];

        // Skip non-string values or node_modules references
        if (typeof extendsPath !== 'string') {continue;}
        if (extendsPath.startsWith('@') || extendsPath.includes('node_modules')) {continue;}

        const { exists } = pathExists(packageDir, extendsPath);

        if (!exists) {
          const pathLabel = Array.isArray(tsconfig.extends)
            ? `tsconfig.json:extends[${i}]`
            : 'tsconfig.json:extends';

          issues.push({
            type: 'broken_tsconfig_extends',
            severity: 'error',
            path: pathLabel,
            message: `tsconfig extends path does not exist: ${extendsPath}`,
            value: extendsPath,
          });
        }
      }
    }

    // Check references
    if (tsconfig.references && Array.isArray(tsconfig.references)) {
      for (let i = 0; i < tsconfig.references.length; i++) {
        const ref = tsconfig.references[i];
        if (ref.path) {
          const { exists } = pathExists(packageDir, ref.path);

          if (!exists) {
            issues.push({
              type: 'broken_tsconfig_reference',
              severity: 'error',
              path: `tsconfig.json:references[${i}]`,
              message: `tsconfig reference path does not exist: ${ref.path}`,
              value: ref.path,
            });
          }
        }
      }
    }

    // Check paths aliases
    if (tsconfig.compilerOptions?.paths) {
      for (const [alias, targets] of Object.entries(tsconfig.compilerOptions.paths)) {
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];

          // Skip wildcards
          if (target.includes('*')) {continue;}

          const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
          const basePath = path.resolve(packageDir, baseUrl);
          const { exists } = pathExists(basePath, target);

          if (!exists) {
            issues.push({
              type: 'broken_tsconfig_path',
              severity: 'warning',
              path: `tsconfig.json:compilerOptions.paths["${alias}"][${i}]`,
              message: `tsconfig path alias target does not exist: ${target}`,
              value: target,
            });
          }
        }
      }
    }
  } catch (error) {
    issues.push({
      type: 'invalid_tsconfig',
      severity: 'error',
      path: 'tsconfig.json',
      message: `Invalid tsconfig.json: ${error.message}`,
    });
  }

  return issues;
}

/**
 * Check package.json files field
 */
function checkFilesField(packageJson, packageDir) {
  const issues = [];

  if (!packageJson.files || !Array.isArray(packageJson.files)) {return issues;}

  for (const file of packageJson.files) {
    // Skip glob patterns
    if (file.includes('*')) {continue;}

    const { exists } = pathExists(packageDir, file);

    if (!exists) {
      // Check if it's a dist folder
      const isDist = file === 'dist' || file.startsWith('dist/');

      issues.push({
        type: 'broken_files_entry',
        severity: isDist ? 'warning' : 'error',
        path: `files`,
        message: `File/folder in "files" field does not exist: ${file}${isDist ? ' (may need build)' : ''}`,
        value: file,
      });
    }
  }

  return issues;
}

/**
 * Check single package
 */
function checkPackage(pkg, workspaceNames) {
  const { path: packagePath, dir: packageDir, repo } = pkg;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const packageName = packageJson.name;

    if (!packageName) {
      return {
        name: 'unknown',
        dir: packageDir,
        repo,
        issues: [{
          type: 'missing_name',
          severity: 'error',
          path: 'name',
          message: 'package.json missing "name" field',
        }],
      };
    }

    const issues = [
      ...checkDependencies(packageJson, packageDir, workspaceNames),
      ...checkExports(packageJson, packageDir),
      ...checkBin(packageJson, packageDir),
      ...checkEntryPoints(packageJson, packageDir),
      ...checkFilesField(packageJson, packageDir),
      ...checkTsconfig(packageDir),
    ];

    return {
      name: packageName,
      dir: packageDir,
      repo,
      issues,
    };
  } catch (error) {
    return {
      name: 'unknown',
      dir: packageDir,
      repo,
      issues: [{
        type: 'invalid_package_json',
        severity: 'error',
        path: 'package.json',
        message: `Invalid package.json: ${error.message}`,
      }],
    };
  }
}

/**
 * Print results
 */
function printResults(results) {
  log('\n🔗 KB Labs Path Validator\n', 'bold');

  const packagesWithIssues = results.filter(r => r.issues.length > 0);
  const errorCount = results.reduce((sum, r) =>
    sum + r.issues.filter(i => i.severity === 'error').length, 0);
  const warningCount = results.reduce((sum, r) =>
    sum + r.issues.filter(i => i.severity === 'warning').length, 0);

  if (packagesWithIssues.length === 0) {
    log('✅ All paths are valid!\n', 'green');
    log(`Checked ${results.length} package(s)`, 'gray');
    return;
  }

  // Group by issue type
  const byType = new Map();
  for (const result of packagesWithIssues) {
    for (const issue of result.issues) {
      if (!byType.has(issue.type)) {
        byType.set(issue.type, []);
      }
      byType.get(issue.type).push({ ...issue, package: result.name, repo: result.repo });
    }
  }

  // Print by severity first - errors
  const issueTypeNames = {
    missing_workspace_package: '📦 Missing Workspace Packages',
    broken_link: '🔗 Broken Link References',
    broken_file_ref: '📁 Broken File References',
    broken_export: '📤 Broken Exports',
    broken_bin: '⚙️  Broken Bin Scripts',
    broken_entry_point: '🚪 Broken Entry Points',
    broken_tsconfig_extends: '📝 Broken tsconfig Extends',
    broken_tsconfig_reference: '📝 Broken tsconfig References',
    broken_tsconfig_path: '📝 Broken tsconfig Paths',
    broken_files_entry: '📋 Broken Files Field Entries',
    invalid_tsconfig: '❌ Invalid tsconfig.json',
    invalid_package_json: '❌ Invalid package.json',
    missing_name: '❌ Missing Package Name',
  };

  // Print errors first
  for (const [type, issues] of byType.entries()) {
    const errors = issues.filter(i => i.severity === 'error');
    if (errors.length === 0) {continue;}

    log(`\n${issueTypeNames[type] || type} (${errors.length}):\n`, 'red');

    // Group by repo
    const byRepo = new Map();
    for (const issue of errors) {
      if (!byRepo.has(issue.repo)) {
        byRepo.set(issue.repo, []);
      }
      byRepo.get(issue.repo).push(issue);
    }

    for (const [repo, repoIssues] of byRepo.entries()) {
      log(`   ${repo}/`, 'yellow');
      for (const issue of repoIssues) {
        log(`      ${issue.package}`, 'cyan');
        log(`         ${issue.message}`, 'gray');
        if (issue.value && options.verbose) {
          log(`         Value: ${issue.value}`, 'gray');
        }
      }
    }
  }

  // Print warnings
  for (const [type, issues] of byType.entries()) {
    const warnings = issues.filter(i => i.severity === 'warning');
    if (warnings.length === 0) {continue;}

    log(`\n${issueTypeNames[type] || type} (${warnings.length}) ⚠️:\n`, 'yellow');

    for (const issue of warnings.slice(0, 10)) {
      log(`   ${issue.package}: ${issue.message}`, 'gray');
    }
    if (warnings.length > 10) {
      log(`   ... and ${warnings.length - 10} more`, 'gray');
    }
  }

  // Summary
  log('\n' + '─'.repeat(60), 'gray');
  log('📊 Summary:', 'blue');
  log(`   Packages checked:  ${results.length}`, 'cyan');
  log(`   Packages with issues: ${packagesWithIssues.length}`, packagesWithIssues.length > 0 ? 'yellow' : 'green');
  log(`   ❌ Errors:         ${errorCount}`, errorCount > 0 ? 'red' : 'green');
  log(`   ⚠️  Warnings:       ${warningCount}`, warningCount > 0 ? 'yellow' : 'green');
  log('', 'reset');

  if (errorCount > 0) {
    log('💡 Tips:', 'blue');
    log('   • Missing workspace packages: Remove or fix the dependency', 'gray');
    log('   • Broken exports/bin: Update path or create missing file', 'gray');
    log('   • Broken entry points with "(may need build)": Run pnpm build', 'gray');
    log('   • Broken tsconfig: Fix extends/references paths', 'gray');
    log('', 'reset');
  }
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  if (!options.json) {
    log('\n🔗 KB Labs Path Validator\n', 'bold');
    log('Validating all paths and references...\n', 'gray');
  }

  const packages = findPackages(rootDir, options.package);

  if (packages.length === 0) {
    if (!options.json) {
      log('⚠️  No KB Labs packages found', 'yellow');
    }
    process.exit(0);
  }

  if (!options.json) {
    log(`Found ${packages.length} package(s) to check\n`, 'gray');
  }

  // Get all workspace package names for reference validation
  const workspaceNames = getWorkspacePackageNames(packages);

  // Check all packages
  const results = packages.map(pkg => checkPackage(pkg, workspaceNames));

  if (options.json) {
    const errorCount = results.reduce((sum, r) =>
      sum + r.issues.filter(i => i.severity === 'error').length, 0);
    const warningCount = results.reduce((sum, r) =>
      sum + r.issues.filter(i => i.severity === 'warning').length, 0);

    console.log(JSON.stringify({
      totalPackages: results.length,
      packagesWithIssues: results.filter(r => r.issues.length > 0).length,
      errorCount,
      warningCount,
      issues: results
        .filter(r => r.issues.length > 0)
        .map(r => ({
          package: r.name,
          repo: r.repo,
          issues: r.issues,
        })),
    }, null, 2));

    process.exit(errorCount > 0 ? 1 : 0);
  }

  printResults(results);

  // Exit with error if there are errors
  const errorCount = results.reduce((sum, r) =>
    sum + r.issues.filter(i => i.severity === 'error').length, 0);

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
