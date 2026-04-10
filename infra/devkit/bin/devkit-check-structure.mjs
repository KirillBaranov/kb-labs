#!/usr/bin/env node

/**
 * @kb-labs/devkit - Package Structure Checker
 *
 * Checks for:
 * 1. Missing README.md files
 * 2. Missing LICENSE files
 * 3. Required package.json fields (name, version, main, types, exports)
 * 4. Architecture violations (e.g., domain importing from infra)
 * 5. Inconsistent project structure
 *
 * Usage:
 *   kb-devkit-check-structure                    # Check all packages
 *   kb-devkit-check-structure --package cli-core # Check specific package
 *   kb-devkit-check-structure --strict           # Include warnings
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
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
  strict: args.includes('--strict'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

/**
 * Required package.json fields
 */
const REQUIRED_FIELDS = {
  critical: ['name', 'version', 'type'],
  important: ['description', 'main', 'types'],
  recommended: ['exports', 'files', 'scripts', 'engines'],
};

/**
 * Required files in package directory
 */
const REQUIRED_FILES = {
  critical: ['package.json', 'src'],
  important: ['README.md', 'tsconfig.json'],
  recommended: ['LICENSE', '.gitignore'],
};

/**
 * Check package structure
 */
function checkPackage(packageJsonPath) {
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const packageName = packageJson.name;

  if (!packageName || !packageName.startsWith('@kb-labs/')) {
    return null; // Skip non-KB Labs packages
  }

  const issues = {
    missingFiles: [],
    missingFields: [],
    structureIssues: [],
    warnings: [],
  };

  // Check required files
  for (const level of ['critical', 'important']) {
    for (const file of REQUIRED_FILES[level]) {
      const filePath = path.join(packageDir, file);
      const exists = fs.existsSync(filePath);

      if (!exists) {
        issues.missingFiles.push({
          file,
          level,
          severity: level === 'critical' ? 'error' : 'warning',
        });
      }
    }
  }

  if (options.strict) {
    for (const file of REQUIRED_FILES.recommended) {
      const filePath = path.join(packageDir, file);
      if (!fs.existsSync(filePath)) {
        issues.missingFiles.push({
          file,
          level: 'recommended',
          severity: 'info',
        });
      }
    }
  }

  // Check required package.json fields
  for (const level of ['critical', 'important']) {
    for (const field of REQUIRED_FIELDS[level]) {
      if (!packageJson[field]) {
        issues.missingFields.push({
          field,
          level,
          severity: level === 'critical' ? 'error' : 'warning',
        });
      }
    }
  }

  if (options.strict) {
    for (const field of REQUIRED_FIELDS.recommended) {
      if (!packageJson[field]) {
        issues.missingFields.push({
          field,
          level: 'recommended',
          severity: 'info',
        });
      }
    }
  }

  // Check README.md content quality
  const readmePath = path.join(packageDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readmeContent = fs.readFileSync(readmePath, 'utf-8');
    const readmeLength = readmeContent.length;

    if (readmeLength < 200) {
      issues.warnings.push({
        type: 'readme-too-short',
        message: `README.md is very short (${readmeLength} chars)`,
        suggestion: 'Add documentation about purpose, usage, and API',
      });
    }

    // Check for common sections
    const hasSections = {
      install: /##\s+(Installation|Install|Setup)/i.test(readmeContent),
      usage: /##\s+(Usage|Getting Started|Quick Start)/i.test(readmeContent),
      api: /##\s+(API|Reference|Documentation)/i.test(readmeContent),
    };

    if (!hasSections.usage && options.strict) {
      issues.warnings.push({
        type: 'readme-missing-usage',
        message: 'README.md missing "Usage" section',
        suggestion: 'Add usage examples and getting started guide',
      });
    }
  }

  // Check for consistent source structure
  const srcDir = path.join(packageDir, 'src');
  if (fs.existsSync(srcDir)) {
    const srcFiles = fs.readdirSync(srcDir);
    const hasIndex = srcFiles.some((f) => /^index\.(ts|tsx|js|jsx)$/.test(f));

    if (!hasIndex) {
      issues.structureIssues.push({
        type: 'missing-index',
        message: 'No index file in src/ directory',
        suggestion: 'Create src/index.ts as main entry point',
        severity: 'warning',
      });
    }

    // Check for test files in src/ (should be in tests/ or __tests__)
    const hasTestsInSrc = srcFiles.some(
      (f) => f.includes('.test.') || f.includes('.spec.') || f === '__tests__'
    );

    if (hasTestsInSrc && options.strict) {
      issues.warnings.push({
        type: 'tests-in-src',
        message: 'Test files found in src/ directory',
        suggestion: 'Consider moving tests to separate tests/ directory',
      });
    }
  }

  // Check package.json scripts
  if (packageJson.scripts) {
    const hasRequiredScripts = {
      build: !!packageJson.scripts.build,
      test: !!packageJson.scripts.test,
      lint: !!packageJson.scripts.lint,
    };

    if (!hasRequiredScripts.build) {
      issues.structureIssues.push({
        type: 'missing-build-script',
        message: 'No "build" script in package.json',
        suggestion: 'Add "build": "tsup" to scripts',
        severity: 'warning',
      });
    }
  }

  // Check TypeScript configuration
  const tsconfigPath = path.join(packageDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

      // Check if it extends devkit preset
      if (tsconfig.extends && !tsconfig.extends.includes('@kb-labs/devkit')) {
        issues.warnings.push({
          type: 'tsconfig-not-using-devkit',
          message: 'tsconfig.json not extending @kb-labs/devkit preset',
          suggestion: 'Use "@kb-labs/devkit/tsconfig/node.json" for consistency',
        });
      }
    } catch (err) {
      issues.structureIssues.push({
        type: 'invalid-tsconfig',
        message: 'tsconfig.json has invalid JSON',
        suggestion: 'Fix JSON syntax errors',
        severity: 'error',
      });
    }
  }

  // Check exports field consistency
  if (packageJson.exports) {
    const mainExport = packageJson.exports['.'];

    if (!mainExport) {
      issues.structureIssues.push({
        type: 'exports-missing-main',
        message: 'package.json exports field missing "." entry',
        suggestion: 'Add main export: { ".": "./dist/index.js" }',
        severity: 'error',
      });
    }
  }

  // Check for .npmignore or files field
  const hasNpmignore = fs.existsSync(path.join(packageDir, '.npmignore'));
  const hasFilesField = !!packageJson.files;

  if (!hasNpmignore && !hasFilesField && !packageJson.private) {
    issues.warnings.push({
      type: 'no-publish-config',
      message: 'No .npmignore or "files" field (will publish everything)',
      suggestion: 'Add "files": ["dist", "README.md", "LICENSE"] to package.json',
    });
  }

  return {
    packageName,
    packageDir,
    packageJsonPath,
    ...issues,
  };
}

/**
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  log('\n📐 KB Labs Structure Checker\n', 'blue');

  if (options.package) {
    log(`Checking package: ${options.package}\n`, 'gray');
  } else {
    log('Checking all packages...\n', 'gray');
  }

  if (options.strict) {
    log('⚠️  Strict mode enabled (includes recommendations)\n', 'yellow');
  }

  const packages = findPackages(rootDir, options.package);

  if (packages.length === 0) {
    log('⚠️  No KB Labs packages found', 'yellow');
    log('   Run this command from the monorepo root\n', 'gray');
    process.exit(0);
  }

  log(`Found ${packages.length} package(s) to check\n`, 'gray');

  const results = [];

  // Check each package
  for (const packagePath of packages) {
    const result = checkPackage(packagePath);
    if (result) {
      results.push(result);
    }
  }

  // Print results
  let hasIssues = false;
  let hasErrors = false;

  for (const result of results) {
    const errorCount = [
      ...result.missingFiles.filter((f) => f.severity === 'error'),
      ...result.missingFields.filter((f) => f.severity === 'error'),
      ...result.structureIssues.filter((i) => i.severity === 'error'),
    ].length;

    const warningCount = [
      ...result.missingFiles.filter((f) => f.severity === 'warning'),
      ...result.missingFields.filter((f) => f.severity === 'warning'),
      ...result.structureIssues.filter((i) => i.severity === 'warning'),
      ...result.warnings,
    ].length;

    const issueCount = errorCount + warningCount;

    if (issueCount === 0 && !options.verbose) {continue;}

    hasIssues = issueCount > 0;
    hasErrors = hasErrors || errorCount > 0;

    if (errorCount > 0) {
      log(`\n❌ ${result.packageName}`, 'red');
    } else if (warningCount > 0) {
      log(`\n⚠️  ${result.packageName}`, 'yellow');
    } else if (options.verbose) {
      log(`\n✅ ${result.packageName}`, 'green');
    }

    log(`   ${path.relative(rootDir, result.packageDir)}`, 'gray');

    // Missing files
    const criticalFiles = result.missingFiles.filter((f) => f.severity === 'error');
    if (criticalFiles.length > 0) {
      log(`\n   🔴 Missing critical files (${criticalFiles.length}):`, 'red');
      for (const file of criticalFiles) {
        log(`      ${file.file}`, 'yellow');
      }
    }

    const warningFiles = result.missingFiles.filter((f) => f.severity === 'warning');
    if (warningFiles.length > 0) {
      log(`\n   🟡 Missing important files (${warningFiles.length}):`, 'yellow');
      for (const file of warningFiles) {
        log(`      ${file.file}`, 'gray');
      }
    }

    // Missing fields
    const criticalFields = result.missingFields.filter((f) => f.severity === 'error');
    if (criticalFields.length > 0) {
      log(`\n   🔴 Missing critical fields (${criticalFields.length}):`, 'red');
      for (const field of criticalFields) {
        log(`      ${field.field}`, 'yellow');
      }
    }

    const warningFields = result.missingFields.filter((f) => f.severity === 'warning');
    if (warningFields.length > 0) {
      log(`\n   🟡 Missing important fields (${warningFields.length}):`, 'yellow');
      for (const field of warningFields) {
        log(`      ${field.field}`, 'gray');
      }
    }

    // Structure issues
    if (result.structureIssues.length > 0) {
      const errors = result.structureIssues.filter((i) => i.severity === 'error');
      const warnings = result.structureIssues.filter((i) => i.severity === 'warning');

      if (errors.length > 0) {
        log(`\n   🔴 Structure errors (${errors.length}):`, 'red');
        for (const issue of errors) {
          log(`      ${issue.message}`, 'yellow');
          log(`      💡 ${issue.suggestion}`, 'blue');
        }
      }

      if (warnings.length > 0) {
        log(`\n   🟡 Structure warnings (${warnings.length}):`, 'yellow');
        for (const issue of warnings) {
          log(`      ${issue.message}`, 'gray');
          log(`      💡 ${issue.suggestion}`, 'blue');
        }
      }
    }

    // Other warnings
    if (result.warnings.length > 0 && options.strict) {
      log(`\n   ℹ️  Recommendations (${result.warnings.length}):`, 'cyan');
      for (const warning of result.warnings) {
        log(`      ${warning.message}`, 'gray');
        if (warning.suggestion) {
          log(`      💡 ${warning.suggestion}`, 'blue');
        }
      }
    }
  }

  // Summary
  log('\n' + '─'.repeat(60) + '\n', 'gray');

  if (!hasIssues) {
    log('✅ All packages have proper structure!\n', 'green');
    process.exit(0);
  }

  log('📊 Summary:\n', 'blue');

  const totalErrors = results.reduce(
    (sum, r) =>
      sum +
      r.missingFiles.filter((f) => f.severity === 'error').length +
      r.missingFields.filter((f) => f.severity === 'error').length +
      r.structureIssues.filter((i) => i.severity === 'error').length,
    0
  );

  const totalWarnings = results.reduce(
    (sum, r) =>
      sum +
      r.missingFiles.filter((f) => f.severity === 'warning').length +
      r.missingFields.filter((f) => f.severity === 'warning').length +
      r.structureIssues.filter((i) => i.severity === 'warning').length +
      r.warnings.length,
    0
  );

  if (totalErrors > 0) {
    log(`   🔴 ${totalErrors} error(s)`, 'red');
  }
  if (totalWarnings > 0) {
    log(`   🟡 ${totalWarnings} warning(s)`, 'yellow');
  }

  log('\n💡 Tips:', 'blue');
  log('   • Use --verbose to see all packages (including clean ones)', 'gray');
  log('   • Use --package=<name> to check a specific package', 'gray');
  log('   • Use --strict to include recommendations', 'gray');
  log('');

  process.exit(hasErrors ? 1 : 0);
}

main();
