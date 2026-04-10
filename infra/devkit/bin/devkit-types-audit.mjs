#!/usr/bin/env node

/**
 * @kb-labs/devkit - TypeScript Types Audit
 *
 * Deep type safety analysis for the entire monorepo using TypeScript Compiler API.
 * Shows centralized audit report with type coverage, errors, and dependency chains.
 *
 * Unlike simple linting, this:
 * - Uses TypeScript Compiler API for semantic analysis
 * - Tracks type inheritance chains across packages
 * - Shows impact: what breaks if type X is wrong
 * - Provides single audit report for entire monorepo
 *
 * Usage:
 *   kb-devkit-types-audit                    # Full audit report
 *   kb-devkit-types-audit --package=cli-core # Specific package
 *   kb-devkit-types-audit --errors-only      # Only show errors
 *   kb-devkit-types-audit --coverage         # Type coverage report
 *   kb-devkit-types-audit --json             # JSON output
 */

import ts from 'typescript';
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
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  json: args.includes('--json'),
  errorsOnly: args.includes('--errors-only'),
  coverage: args.includes('--coverage'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
};

/**
 * Find all packages with TypeScript configs
 */
function findPackages(rootDir) {
  return _findPackagePaths(rootDir)
    .map((pkgPath) => {
      const dir = path.dirname(pkgPath);
      const tsconfigPath = path.join(dir, 'tsconfig.json');
      if (!fs.existsSync(tsconfigPath)) return null;
      const packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return { name: packageJson.name, path: pkgPath, dir, tsconfigPath };
    })
    .filter(Boolean);
}

/**
 * Create TypeScript program for a package
 */
function createProgram(packageDir, tsconfigPath) {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (configFile.error) {
    return null;
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageDir
  );

  if (parsedConfig.errors.length > 0) {
    return null;
  }

  return ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
}

/**
 * Analyze type errors in a package
 */
function analyzeTypeErrors(program, packageName) {
  const diagnostics = ts.getPreEmitDiagnostics(program);

  const errors = [];
  const warnings = [];

  for (const diagnostic of diagnostics) {
    if (!diagnostic.file) {continue;}

    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start
    );

    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const severity = diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning';

    const issue = {
      severity,
      message,
      file: diagnostic.file.fileName,
      line: line + 1,
      column: character + 1,
      code: diagnostic.code,
    };

    if (severity === 'error') {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  return { errors, warnings };
}

/**
 * Calculate type coverage for a package
 */
function calculateTypeCoverage(program) {
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles().filter(
    (sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules')
  );

  let totalSymbols = 0;
  let typedSymbols = 0;
  let anyCount = 0;
  let unknownCount = 0;
  let tsIgnoreCount = 0;

  for (const sourceFile of sourceFiles) {
    // Count @ts-ignore comments
    const text = sourceFile.getFullText();
    const tsIgnoreMatches = text.match(/@ts-ignore/g);
    tsIgnoreCount += tsIgnoreMatches ? tsIgnoreMatches.length : 0;

    ts.forEachChild(sourceFile, function visit(node) {
      // Check for 'any' type
      if (ts.isTypeNode(node)) {
        totalSymbols++;

        const type = checker.getTypeAtLocation(node);

        if (type.flags & ts.TypeFlags.Any) {
          anyCount++;
        } else if (type.flags & ts.TypeFlags.Unknown) {
          unknownCount++;
        } else {
          typedSymbols++;
        }
      }

      // Check variables, parameters, properties
      if (
        ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isPropertyDeclaration(node)
      ) {
        totalSymbols++;

        if (node.type) {
          const type = checker.getTypeAtLocation(node.type);

          if (type.flags & ts.TypeFlags.Any) {
            anyCount++;
          } else if (type.flags & ts.TypeFlags.Unknown) {
            unknownCount++;
          } else {
            typedSymbols++;
          }
        } else {
          // No explicit type annotation - check inferred type
          const symbol = checker.getSymbolAtLocation(node.name);
          if (symbol) {
            const type = checker.getTypeOfSymbolAtLocation(symbol, node);

            if (type.flags & ts.TypeFlags.Any) {
              anyCount++;
            } else {
              typedSymbols++;
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    });
  }

  const coverage = totalSymbols > 0 ? (typedSymbols / totalSymbols) * 100 : 100;

  return {
    coverage: Math.round(coverage * 10) / 10,
    totalSymbols,
    typedSymbols,
    anyCount,
    unknownCount,
    tsIgnoreCount,
  };
}

/**
 * Find type dependencies and inheritance chains
 */
function findTypeDependencies(program, packageName) {
  const checker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles().filter(
    (sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules')
  );

  const imports = new Set();
  const extendsChains = [];
  const implementsChains = [];

  for (const sourceFile of sourceFiles) {
    ts.forEachChild(sourceFile, function visit(node) {
      // Track type imports
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const moduleName = moduleSpecifier.text;
          if (moduleName.startsWith('@kb-labs/')) {
            imports.add(moduleName);
          }
        }
      }

      // Track interface/class extensions
      if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            for (const type of clause.types) {
              const typeName = type.expression.getText();

              if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                extendsChains.push({
                  child: node.name?.getText() || 'anonymous',
                  parent: typeName,
                  file: sourceFile.fileName,
                });
              } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
                implementsChains.push({
                  class: node.name?.getText() || 'anonymous',
                  interface: typeName,
                  file: sourceFile.fileName,
                });
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    });
  }

  return {
    imports: Array.from(imports),
    extends: extendsChains,
    implements: implementsChains,
  };
}

/**
 * Audit a single package
 */
function auditPackage(packageInfo) {
  const { name, dir, tsconfigPath } = packageInfo;

  log(`  Analyzing ${name}...`, 'gray');

  const program = createProgram(dir, tsconfigPath);

  if (!program) {
    return {
      name,
      success: false,
      reason: 'Failed to create TypeScript program',
    };
  }

  const { errors, warnings } = analyzeTypeErrors(program, name);
  const coverage = calculateTypeCoverage(program);
  const dependencies = findTypeDependencies(program, name);

  return {
    name,
    success: true,
    errors,
    warnings,
    coverage,
    dependencies,
  };
}

/**
 * Build impact graph (what breaks if this package has type errors)
 */
function buildImpactGraph(results) {
  const graph = new Map();

  // Build reverse dependency map
  for (const result of results) {
    if (!result.success) {continue;}

    graph.set(result.name, new Set());

    for (const dep of result.dependencies.imports) {
      if (!graph.has(dep)) {
        graph.set(dep, new Set());
      }
      graph.get(dep).add(result.name);
    }
  }

  return graph;
}

/**
 * Calculate impact score (how many packages depend on this)
 */
function calculateImpact(packageName, impactGraph) {
  const visited = new Set();
  const queue = [packageName];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) {continue;}
    visited.add(current);

    const dependents = impactGraph.get(current);
    if (dependents) {
      for (const dep of dependents) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  return visited.size - 1; // Exclude the package itself
}

/**
 * Print audit report
 */
function printAuditReport(results, impactGraph) {
  log('\n📊 TypeScript Type Safety Audit Report\n', 'bold');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  log(`Analyzed ${successful.length} package(s)\n`, 'gray');

  // Critical Issues
  const withErrors = successful.filter((r) => r.errors.length > 0);

  if (withErrors.length > 0) {
    log(`❌ Critical Issues (${withErrors.length} packages with type errors):\n`, 'red');

    for (const result of withErrors.slice(0, 5)) {
      const impact = calculateImpact(result.name, impactGraph);

      log(`   ${result.name}`, 'yellow');
      log(`      ${result.errors.length} error(s) - impacts ${impact} package(s)`, 'red');

      if (options.verbose) {
        for (const error of result.errors.slice(0, 3)) {
          const relPath = error.file.replace(process.cwd(), '.');
          log(`      └─ ${relPath}:${error.line}:${error.column}`, 'gray');
          log(`         ${error.message}`, 'gray');
        }
      }
    }

    if (withErrors.length > 5) {
      log(`   ... and ${withErrors.length - 5} more packages with errors`, 'gray');
    }

    log('', 'reset');
  }

  // Warnings
  if (!options.errorsOnly) {
    const totalWarnings = successful.reduce((sum, r) => sum + r.warnings.length, 0);

    if (totalWarnings > 0) {
      log(`⚠️  Warnings (${totalWarnings} total):\n`, 'yellow');

      const topWarnings = successful
        .filter((r) => r.warnings.length > 0)
        .sort((a, b) => b.warnings.length - a.warnings.length)
        .slice(0, 5);

      for (const result of topWarnings) {
        log(`   ${result.name}: ${result.warnings.length} warning(s)`, 'gray');
      }

      log('', 'reset');
    }
  }

  // Type Safety Issues
  if (!options.errorsOnly) {
    const anyUsage = successful.filter((r) => r.coverage.anyCount > 0);
    const tsIgnoreUsage = successful.filter((r) => r.coverage.tsIgnoreCount > 0);

    if (anyUsage.length > 0 || tsIgnoreUsage.length > 0) {
      log(`🔍 Type Safety Issues:\n`, 'yellow');

      const totalAny = successful.reduce((sum, r) => sum + r.coverage.anyCount, 0);
      const totalTsIgnore = successful.reduce((sum, r) => sum + r.coverage.tsIgnoreCount, 0);

      log(`   ${totalAny} usage(s) of 'any' type`, totalAny > 50 ? 'red' : 'yellow');
      log(`   ${totalTsIgnore} @ts-ignore comment(s)`, totalTsIgnore > 20 ? 'red' : 'yellow');

      log('', 'reset');
    }
  }

  // Type Coverage
  if (options.coverage || !options.errorsOnly) {
    log(`📈 Type Coverage:\n`, 'blue');

    const sorted = [...successful].sort((a, b) => a.coverage.coverage - b.coverage.coverage);

    const excellent = sorted.filter((r) => r.coverage.coverage >= 90);
    const good = sorted.filter((r) => r.coverage.coverage >= 70 && r.coverage.coverage < 90);
    const poor = sorted.filter((r) => r.coverage.coverage < 70);

    log(`   ✅ Excellent (≥90%): ${excellent.length} packages`, 'green');
    log(`   ⚠️  Good (70-90%):   ${good.length} packages`, 'yellow');
    log(`   ❌ Poor (<70%):      ${poor.length} packages`, 'red');

    if (options.verbose || options.coverage) {
      log('\n   Top packages by coverage:', 'cyan');
      for (const result of sorted.slice(-5).reverse()) {
        const coverage = result.coverage.coverage;
        const color = coverage >= 90 ? 'green' : coverage >= 70 ? 'yellow' : 'red';
        log(`      ${result.name.padEnd(35)} ${coverage.toFixed(1)}%`, color);
      }

      log('\n   Bottom packages by coverage:', 'cyan');
      for (const result of sorted.slice(0, 5)) {
        const coverage = result.coverage.coverage;
        const color = coverage >= 90 ? 'green' : coverage >= 70 ? 'yellow' : 'red';
        log(`      ${result.name.padEnd(35)} ${coverage.toFixed(1)}%`, color);
      }
    }

    log('', 'reset');
  }

  // Summary
  log('─'.repeat(60) + '\n', 'gray');
  log('📊 Summary:\n', 'blue');

  const totalErrors = successful.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = successful.reduce((sum, r) => sum + r.warnings.length, 0);
  const avgCoverage =
    successful.reduce((sum, r) => sum + r.coverage.coverage, 0) / successful.length;

  log(`   Total packages:     ${successful.length}`, 'cyan');
  log(`   ❌ Type errors:     ${totalErrors}`, totalErrors > 0 ? 'red' : 'green');
  log(`   ⚠️  Warnings:        ${totalWarnings}`, totalWarnings > 0 ? 'yellow' : 'green');
  log(`   📈 Avg coverage:    ${avgCoverage.toFixed(1)}%`, avgCoverage >= 80 ? 'green' : 'yellow');

  if (failed.length > 0) {
    log(`   ⚠️  Failed to analyze: ${failed.length}`, 'yellow');
  }

  log('', 'reset');

  // Tips
  log('💡 Tips:', 'blue');
  log('   • Use --errors-only to show only critical issues', 'gray');
  log('   • Use --coverage to see detailed coverage report', 'gray');
  log('   • Use --package=name to audit specific package', 'gray');
  log('   • Fix type errors to improve type safety', 'gray');
  log('', 'reset');
}

/**
 * Main function
 */
async function main() {
  const rootDir = process.cwd();

  if (!options.json) {
    log('\n🚀 KB Labs TypeScript Type Safety Audit\n', 'bold');
  }

  let packages = findPackages(rootDir);

  if (options.package) {
    const fullPackageName = options.package.startsWith('@kb-labs/')
      ? options.package
      : `@kb-labs/${options.package}`;

    packages = packages.filter((p) => p.name === fullPackageName);

    if (packages.length === 0) {
      log(`⚠️  Package not found: ${fullPackageName}`, 'yellow');
      process.exit(1);
    }
  }

  if (packages.length === 0) {
    log('⚠️  No packages found with TypeScript configuration', 'yellow');
    process.exit(0);
  }

  log(`Found ${packages.length} package(s) to audit\n`, 'gray');

  // Audit all packages
  const results = [];
  for (const pkg of packages) {
    const result = auditPackage(pkg);
    results.push(result);
  }

  const impactGraph = buildImpactGraph(results);

  if (options.json) {
    const successful = results.filter((r) => r.success);
    const totalErrors = successful.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = successful.reduce((sum, r) => sum + r.warnings.length, 0);
    const avgCoverage =
      successful.reduce((sum, r) => sum + r.coverage.coverage, 0) / successful.length;

    const output = {
      summary: {
        total: results.length,
        successful: successful.length,
        failed: results.filter((r) => !r.success).length,
        totalErrors,
        totalWarnings,
        avgCoverage: Math.round(avgCoverage * 10) / 10,
      },
      packages: results.map((r) => ({
        name: r.name,
        success: r.success,
        errors: r.errors?.length || 0,
        warnings: r.warnings?.length || 0,
        coverage: r.coverage?.coverage,
        anyCount: r.coverage?.anyCount,
        tsIgnoreCount: r.coverage?.tsIgnoreCount,
        impact: calculateImpact(r.name, impactGraph),
      })),
      issues: results
        .filter((r) => r.success && r.errors.length > 0)
        .map((r) => ({
          package: r.name,
          errors: r.errors,
          impact: calculateImpact(r.name, impactGraph),
        })),
    };

    console.log(JSON.stringify(output, null, 2));
  } else {
    printAuditReport(results, impactGraph);
  }

  // Exit with error if there are type errors
  const hasErrors = results.some((r) => r.success && r.errors.length > 0);
  process.exit(hasErrors ? 1 : 0);
}

main();
