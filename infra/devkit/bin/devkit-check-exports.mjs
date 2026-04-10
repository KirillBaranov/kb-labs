#!/usr/bin/env node

/**
 * @kb-labs/devkit - Export Checker
 *
 * Checks for:
 * 1. Unused exports (exported but never imported by other packages)
 * 2. Dead code in public APIs (exports without consumers)
 * 3. Missing barrel exports (files not exported from index.ts)
 * 4. Inconsistent exports (package.json exports vs actual files)
 *
 * Usage:
 *   kb-devkit-check-exports                    # Check all packages
 *   kb-devkit-check-exports --package cli-core # Check specific package
 *   kb-devkit-check-exports --strict           # Include internal-only exports
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
 * Extract exports from TypeScript/JavaScript file
 */
function extractExports(filePath, content) {
  const exports = [];

  // Match: export const/let/var/function/class/interface/type/enum name
  // Match: export { name1, name2 }
  // Match: export * from 'module'
  const patterns = [
    // export const foo = ...
    /export\s+(?:const|let|var)\s+(\w+)/g,
    // export function foo() {}
    /export\s+function\s+(\w+)/g,
    // export class Foo {}
    /export\s+class\s+(\w+)/g,
    // export interface Foo {}
    /export\s+interface\s+(\w+)/g,
    // export type Foo = ...
    /export\s+type\s+(\w+)/g,
    // export enum Foo {}
    /export\s+enum\s+(\w+)/g,
    // export { foo, bar }
    /export\s*{([^}]+)}/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const exportName = match[1];
      const line = content.substring(0, match.index).split('\n').length;

      // Handle export { foo, bar } - multiple exports
      if (exportName.includes(',')) {
        const names = exportName
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n && !n.includes('as')); // Skip "as" renames for now

        for (const name of names) {
          exports.push({ name, line, type: 'named' });
        }
      } else {
        exports.push({ name: exportName, line, type: 'named' });
      }
    }
  }

  // Check for default export
  if (/export\s+default/.test(content)) {
    const line = content.substring(0, content.indexOf('export default')).split('\n').length;
    exports.push({ name: 'default', line, type: 'default' });
  }

  // Check for re-exports (export * from 'module')
  const reExportPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  let reExportMatch;
  while ((reExportMatch = reExportPattern.exec(content)) !== null) {
    const line = content.substring(0, reExportMatch.index).split('\n').length;
    exports.push({
      name: `* from "${reExportMatch[1]}"`,
      line,
      type: 're-export',
    });
  }

  return exports;
}

/**
 * Extract imports from TypeScript/JavaScript file
 */
function extractImports(filePath, content) {
  const imports = [];

  // Match: import { name1, name2 } from 'module'
  // Match: import name from 'module'
  const namedImportPattern = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
  const defaultImportPattern = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;

  let match;

  // Named imports
  while ((match = namedImportPattern.exec(content)) !== null) {
    const names = match[1]
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && !n.includes('as')); // Skip "as" renames

    const module = match[2];

    for (const name of names) {
      imports.push({ name, module, type: 'named' });
    }
  }

  // Default imports
  while ((match = defaultImportPattern.exec(content)) !== null) {
    const name = match[1];
    const module = match[2];

    // Skip if this is actually a named import (has { after import)
    if (!content.substring(match.index, match.index + 50).includes('{')) {
      imports.push({ name, module, type: 'default' });
    }
  }

  return imports;
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
 * Check if export is used in package.json exports field
 */
function isUsedInPackageExports(exportName, packageJson) {
  if (!packageJson.exports) {return false;}

  const exportsStr = JSON.stringify(packageJson.exports);
  return exportsStr.includes(exportName);
}

/**
 * Check package for export issues
 */
function checkPackage(packageJsonPath, allPackages) {
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const packageName = packageJson.name;

  if (!packageName || !packageName.startsWith('@kb-labs/')) {
    return null; // Skip non-KB Labs packages
  }

  const issues = {
    unusedExports: [],
    missingBarrelExports: [],
    inconsistentExports: [],
  };

  const sourceFiles = findSourceFiles(packageDir);

  if (sourceFiles.length === 0) {
    return null; // No source files
  }

  // Step 1: Collect all exports from all files
  const allExports = new Map(); // file -> exports[]

  for (const sourceFile of sourceFiles) {
    const content = fs.readFileSync(sourceFile, 'utf-8');
    const exports = extractExports(sourceFile, content);

    if (exports.length > 0) {
      allExports.set(sourceFile, exports);
    }
  }

  // Step 2: Collect all imports from other packages
  const externalImports = new Map(); // packageName -> imports[]

  for (const otherPackagePath of allPackages) {
    if (otherPackagePath === packageJsonPath) {continue;} // Skip self

    const otherPackageDir = path.dirname(otherPackagePath);
    const otherSourceFiles = findSourceFiles(otherPackageDir);

    for (const otherSourceFile of otherSourceFiles) {
      const content = fs.readFileSync(otherSourceFile, 'utf-8');
      const imports = extractImports(otherSourceFile, content);

      for (const imp of imports) {
        // Check if importing from our package
        if (imp.module === packageName || imp.module.startsWith(`${packageName}/`)) {
          if (!externalImports.has(imp.module)) {
            externalImports.set(imp.module, []);
          }
          externalImports.get(imp.module).push(imp.name);
        }
      }
    }
  }

  // Step 3: Check for unused exports
  const indexFile = sourceFiles.find((f) => /\/index\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
  const indexExports = indexFile ? allExports.get(indexFile) || [] : [];
  const importedNames = new Set();

  for (const imports of externalImports.values()) {
    for (const name of imports) {
      importedNames.add(name);
    }
  }

  for (const [file, exports] of allExports.entries()) {
    const relativeFile = path.relative(packageDir, file);

    // Skip test files
    if (relativeFile.includes('.test.') || relativeFile.includes('.spec.')) {
      continue;
    }

    for (const exp of exports) {
      // Skip re-exports and default exports (harder to track)
      if (exp.type === 're-export' || exp.type === 'default') {
        continue;
      }

      // Skip if used in package.json exports
      if (isUsedInPackageExports(exp.name, packageJson)) {
        continue;
      }

      // Check if exported from index (public API)
      const isInIndex = indexExports.some((e) => e.name === exp.name);

      // If not exported from index and not imported externally
      if (!isInIndex && !importedNames.has(exp.name)) {
        // In strict mode, report all unused exports
        // In normal mode, only report exports from index.ts
        if (options.strict || file === indexFile) {
          issues.unusedExports.push({
            file: relativeFile,
            line: exp.line,
            name: exp.name,
            type: exp.type,
            isPublic: file === indexFile,
          });
        }
      }
    }
  }

  // Step 4: Check for missing barrel exports (files not exported from index.ts)
  if (indexFile && sourceFiles.length > 1) {
    const indexContent = fs.readFileSync(indexFile, 'utf-8');

    for (const file of sourceFiles) {
      if (file === indexFile) {continue;}

      // Skip test files, internal files
      const relativeFile = path.relative(path.dirname(indexFile), file);
      if (
        relativeFile.includes('.test.') ||
        relativeFile.includes('.spec.') ||
        relativeFile.includes('internal/') ||
        relativeFile.includes('__tests__/') ||
        relativeFile.includes('__mocks__/')
      ) {
        continue;
      }

      // Check if file is re-exported from index
      const fileExports = allExports.get(file) || [];
      if (fileExports.length === 0) {continue;}

      const fileBasename = path.basename(file).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
      const isReExported =
        indexContent.includes(`from './${relativeFile.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')}`) ||
        indexContent.includes(`from "./${relativeFile.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')}`) ||
        indexContent.includes(`from './${fileBasename}'`) ||
        indexContent.includes(`from "./${fileBasename}"`);

      if (!isReExported && !options.strict) {
        // Only report in strict mode for now (too noisy otherwise)
        continue;
      }

      if (!isReExported) {
        issues.missingBarrelExports.push({
          file: relativeFile,
          exportsCount: fileExports.length,
        });
      }
    }
  }

  // Step 5: Check package.json exports consistency
  if (packageJson.exports && typeof packageJson.exports === 'object') {
    for (const [exportPath, exportConfig] of Object.entries(packageJson.exports)) {
      if (exportPath === '.') {continue;} // Main export

      // Get the actual file path
      const actualPath =
        typeof exportConfig === 'string'
          ? exportConfig
          : exportConfig.import || exportConfig.require || exportConfig.default;

      if (!actualPath || typeof actualPath !== 'string') {continue;}

      // Check if file exists
      const fullPath = path.join(packageDir, actualPath);
      if (!fs.existsSync(fullPath)) {
        issues.inconsistentExports.push({
          exportPath,
          actualPath,
          issue: 'File does not exist',
        });
      }
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
 * Main function
 */
function main() {
  const rootDir = process.cwd();

  log('\n📤 KB Labs Export Checker\n', 'blue');

  if (options.package) {
    log(`Checking package: ${options.package}\n`, 'gray');
  } else {
    log('Checking all packages...\n', 'gray');
  }

  if (options.strict) {
    log('⚠️  Strict mode enabled (includes internal exports)\n', 'yellow');
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
    const result = checkPackage(packagePath, packages);
    if (result) {
      results.push(result);
    }
  }

  // Print results
  let hasIssues = false;

  for (const result of results) {
    const issueCount =
      result.unusedExports.length +
      result.missingBarrelExports.length +
      result.inconsistentExports.length;

    if (issueCount === 0 && !options.verbose) {continue;}

    hasIssues = issueCount > 0;

    if (issueCount > 0) {
      log(`\n❌ ${result.packageName}`, 'red');
      log(`   ${path.relative(rootDir, result.packageDir)}`, 'gray');
    } else if (options.verbose) {
      log(`\n✅ ${result.packageName}`, 'green');
    }

    // Unused exports
    if (result.unusedExports.length > 0) {
      log(`\n   🟠 Unused exports (${result.unusedExports.length}):`, 'yellow');

      // Group by file
      const byFile = new Map();
      for (const exp of result.unusedExports) {
        if (!byFile.has(exp.file)) {
          byFile.set(exp.file, []);
        }
        byFile.get(exp.file).push(exp);
      }

      for (const [file, exports] of byFile.entries()) {
        log(`      ${file}`, 'cyan');
        for (const exp of exports) {
          const visibility = exp.isPublic ? '(public API)' : '(internal)';
          log(`      └─ ${exp.name} ${visibility}`, 'gray');
        }
      }

      log(`\n      💡 These exports are never imported by other packages`, 'blue');
      log(`      💡 Consider removing them to reduce API surface`, 'blue');
    }

    // Missing barrel exports
    if (result.missingBarrelExports.length > 0 && options.strict) {
      log(`\n   🟡 Files not exported from index.ts (${result.missingBarrelExports.length}):`, 'yellow');

      for (const file of result.missingBarrelExports) {
        log(`      ${file.file}`, 'gray');
        log(`      └─ ${file.exportsCount} export(s)`, 'gray');
      }

      log(`\n      💡 These files have exports but aren't re-exported from index.ts`, 'blue');
      log(`      💡 Consider adding them to the barrel export or marking as internal`, 'blue');
    }

    // Inconsistent exports
    if (result.inconsistentExports.length > 0) {
      log(`\n   🔴 Inconsistent package.json exports (${result.inconsistentExports.length}):`, 'red');

      for (const exp of result.inconsistentExports) {
        log(`      "${exp.exportPath}" → ${exp.actualPath}`, 'yellow');
        log(`      └─ ${exp.issue}`, 'gray');
      }

      log(`\n      💡 Update package.json exports field to match actual files`, 'blue');
    }
  }

  // Summary
  log('\n' + '─'.repeat(60) + '\n', 'gray');

  if (!hasIssues) {
    log('✅ No export issues found!\n', 'green');
    process.exit(0);
  }

  log('📊 Summary:\n', 'blue');

  const unusedCount = results.reduce((sum, r) => sum + r.unusedExports.length, 0);
  const missingCount = results.reduce((sum, r) => sum + r.missingBarrelExports.length, 0);
  const inconsistentCount = results.reduce((sum, r) => sum + r.inconsistentExports.length, 0);

  if (unusedCount > 0) {
    log(`   🟠 ${unusedCount} unused export(s)`, 'yellow');
  }
  if (missingCount > 0 && options.strict) {
    log(`   🟡 ${missingCount} file(s) not in barrel exports`, 'yellow');
  }
  if (inconsistentCount > 0) {
    log(`   🔴 ${inconsistentCount} inconsistent package.json export(s)`, 'red');
  }

  log('\n💡 Tips:', 'blue');
  log('   • Use --verbose to see all packages (including clean ones)', 'gray');
  log('   • Use --package=<name> to check a specific package', 'gray');
  log('   • Use --strict to include internal exports (more thorough)', 'gray');
  log('');

  process.exit(1);
}

main();
