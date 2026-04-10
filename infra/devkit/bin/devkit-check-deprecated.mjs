#!/usr/bin/env node

/**
 * @kb-labs/devkit - Deprecated Code Checker
 *
 * Finds all @deprecated markers in the codebase with context:
 * - JSDoc @deprecated tags
 * - TypeScript @deprecated decorator patterns
 * - Inline // @deprecated comments
 *
 * Provides:
 * - Location and context for each deprecated item
 * - Grouping by package
 * - Statistics and summary
 * - Multiple output formats (table, JSON, markdown)
 *
 * Usage:
 *   kb-devkit-check-deprecated                    # Check all packages
 *   kb-devkit-check-deprecated --package cli-core # Check specific package
 *   kb-devkit-check-deprecated --json             # JSON output for AI/CI
 *   kb-devkit-check-deprecated --md               # Markdown output
 *   kb-devkit-check-deprecated --stats            # Show statistics only
 *   kb-devkit-check-deprecated --verbose          # Show full context
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
  if (!options.json && !options.md) {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  package: args.find((arg) => arg.startsWith('--package='))?.split('=')[1],
  json: args.includes('--json'),
  md: args.includes('--md'),
  stats: args.includes('--stats'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  help: args.includes('--help') || args.includes('-h'),
};

if (options.help) {
  console.log(`
@kb-labs/devkit - Deprecated Code Checker

Finds all @deprecated markers in the codebase.

Usage:
  kb-devkit-check-deprecated                    # Check all packages
  kb-devkit-check-deprecated --package=cli-core # Check specific package
  kb-devkit-check-deprecated --json             # JSON output for AI/CI
  kb-devkit-check-deprecated --md               # Markdown output
  kb-devkit-check-deprecated --stats            # Show statistics only
  kb-devkit-check-deprecated --verbose          # Show full context

Options:
  --package=NAME   Check only specific package
  --json           Output as JSON (for CI/AI agents)
  --md             Output as Markdown table
  --stats          Show statistics summary only
  --verbose, -v    Show full context around deprecated items
  --help, -h       Show this help message
`);
  process.exit(0);
}

/**
 * Find all kb-labs-* packages with src directories
 */
function findPackages(rootDir, filterPackage) {
  return _findPackagePaths(rootDir, filterPackage)
    .map((pkgPath) => {
      const dir = path.dirname(pkgPath);
      const srcDir = path.join(dir, 'src');
      if (!fs.existsSync(srcDir)) return null;
      try {
        const packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const parts = pkgPath.split(path.sep);
        const repo = parts.find((p) => p.startsWith('kb-labs-')) || 'unknown';
        return {
          name: packageJson.name,
          shortName: path.basename(dir),
          repo,
          path: dir,
          srcPath: srcDir,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Recursively find all TypeScript/JavaScript files
 */
function findSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and dist
      if (entry.name === 'node_modules' || entry.name === 'dist') {continue;}
      files.push(...findSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract deprecated items from file content
 */
function extractDeprecated(filePath, content) {
  const deprecated = [];
  const lines = content.split('\n');

  // Only match JSDoc @deprecated - this is the standard way in TypeScript/JavaScript
  // Pattern: /** ... @deprecated ... */
  const jsdocPattern = /\/\*\*[\s\S]*?@deprecated\s*([^\n*]*)?[\s\S]*?\*\//g;

  let match;
  while ((match = jsdocPattern.exec(content)) !== null) {
    // Skip if @deprecated is inside a regex literal or string (e.g., /@deprecated/i)
    const jsdocContent = match[0];
    if (/\/@deprecated\//.test(jsdocContent) || /['"`].*@deprecated.*['"`]/.test(jsdocContent)) {
      continue;
    }
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;
    const lineNumber = content.substring(0, startIndex).split('\n').length;
    const endLine = content.substring(0, endIndex).split('\n').length;

    // Extract reason from @deprecated line
    const deprecatedLineMatch = match[0].match(/@deprecated\s*([^\n*]*)/);
    const reason = (deprecatedLineMatch?.[1] || '').trim();

    // Get context: the code AFTER the JSDoc comment
    const contextLines = [];
    for (let i = endLine; i < Math.min(endLine + 5, lines.length); i++) {
      const line = lines[i];
      // Skip empty lines
      if (line.trim() === '') {continue;}

      contextLines.push(line);

      // Stop at declaration
      if (/^\s*(export\s+)?(default\s+)?(async\s+)?(abstract\s+)?(function|class|interface|type|const|let|var|enum)\s+\w+/.test(line)) {
        break;
      }
      if (contextLines.length >= 2) {break;}
    }

    // Try to extract the name of the deprecated item
    let itemName = 'unknown';
    const contextText = contextLines.join('\n');

    // Match export declarations
    const nameMatch = contextText.match(
      /(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function|class|interface|type|const|let|var|enum)\s+(\w+)/
    );
    if (nameMatch) {
      itemName = nameMatch[1];
    }

    // Determine item type from context
    let itemType = 'unknown';
    if (/\bfunction\b/.test(contextText)) {itemType = 'function';}
    else if (/\bclass\b/.test(contextText)) {itemType = 'class';}
    else if (/\binterface\b/.test(contextText)) {itemType = 'interface';}
    else if (/\btype\s+\w+/.test(contextText)) {itemType = 'type';}
    else if (/\bconst\b/.test(contextText)) {itemType = 'const';}
    else if (/\benum\b/.test(contextText)) {itemType = 'enum';}
    else if (/\blet\b|\bvar\b/.test(contextText)) {itemType = 'variable';}

    // Skip if no code follows (orphan comment)
    if (contextLines.length === 0 || itemName === 'unknown') {
      continue;
    }

    deprecated.push({
      file: filePath,
      line: lineNumber,
      type: 'jsdoc',
      itemType,
      itemName,
      reason: reason || 'No reason provided',
      context: contextLines.slice(0, 2).join('\n'),
    });
  }

  // Deduplicate by item name + file (same item might have multiple @deprecated in same JSDoc)
  const seen = new Set();
  return deprecated.filter((item) => {
    const key = `${item.file}:${item.itemName}`;
    if (seen.has(key)) {return false;}
    seen.add(key);
    return true;
  });
}

/**
 * Analyze a single package
 */
function analyzePackage(pkg) {
  const files = findSourceFiles(pkg.srcPath);
  const deprecated = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const items = extractDeprecated(file, content);
      deprecated.push(...items);
    } catch {
      // Skip unreadable files
    }
  }

  return {
    package: pkg.name,
    shortName: pkg.shortName,
    repo: pkg.repo,
    deprecated,
    fileCount: files.length,
  };
}

/**
 * Format output as table (default)
 */
function formatTable(results, rootDir) {
  const totalDeprecated = results.reduce((sum, r) => sum + r.deprecated.length, 0);

  if (totalDeprecated === 0) {
    log('\n✅ No @deprecated items found!\n', 'green');
    return;
  }

  log(`\n📋 Found ${totalDeprecated} @deprecated item(s)\n`, 'yellow');

  for (const result of results) {
    if (result.deprecated.length === 0) {continue;}

    log(`\n📦 ${result.package} (${result.deprecated.length} deprecated)`, 'cyan');
    log('─'.repeat(60), 'gray');

    for (const item of result.deprecated) {
      const relativePath = path.relative(rootDir, item.file);
      const location = `${relativePath}:${item.line}`;

      log(`  ⚠️  ${item.itemType} ${colors.bold}${item.itemName}${colors.reset}`, 'yellow');
      log(`     📍 ${location}`, 'gray');

      if (item.reason && item.reason !== 'No reason provided') {
        log(`     💬 ${item.reason}`, 'gray');
      }

      if (options.verbose && item.context) {
        log('     ┌─ Context:', 'gray');
        for (const line of item.context.split('\n')) {
          log(`     │ ${line}`, 'gray');
        }
        log('     └─', 'gray');
      }
    }
  }

  // Summary
  log('\n' + '═'.repeat(60), 'gray');
  log('📊 Summary:', 'blue');

  const byType = {};
  for (const result of results) {
    for (const item of result.deprecated) {
      byType[item.itemType] = (byType[item.itemType] || 0) + 1;
    }
  }

  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    log(`   ${type}: ${count}`, 'gray');
  }

  log(`\n   Total: ${totalDeprecated} deprecated item(s) in ${results.filter((r) => r.deprecated.length > 0).length} package(s)`, 'yellow');
  log('', 'reset');
}

/**
 * Format output as JSON
 */
function formatJSON(results, rootDir) {
  const output = {
    summary: {
      totalDeprecated: results.reduce((sum, r) => sum + r.deprecated.length, 0),
      packagesWithDeprecated: results.filter((r) => r.deprecated.length > 0).length,
      totalPackages: results.length,
      byType: {},
    },
    packages: results
      .filter((r) => r.deprecated.length > 0)
      .map((r) => ({
        name: r.package,
        shortName: r.shortName,
        repo: r.repo,
        deprecatedCount: r.deprecated.length,
        items: r.deprecated.map((item) => ({
          name: item.itemName,
          type: item.itemType,
          file: path.relative(rootDir, item.file),
          line: item.line,
          reason: item.reason,
          context: options.verbose ? item.context : undefined,
        })),
      })),
  };

  // Calculate byType
  for (const result of results) {
    for (const item of result.deprecated) {
      output.summary.byType[item.itemType] = (output.summary.byType[item.itemType] || 0) + 1;
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Format output as Markdown
 */
function formatMarkdown(results, rootDir) {
  const totalDeprecated = results.reduce((sum, r) => sum + r.deprecated.length, 0);

  console.log('# Deprecated Code Report\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  console.log('## Summary\n');
  console.log(`- **Total deprecated items:** ${totalDeprecated}`);
  console.log(`- **Packages affected:** ${results.filter((r) => r.deprecated.length > 0).length}`);
  console.log(`- **Total packages scanned:** ${results.length}\n`);

  if (totalDeprecated === 0) {
    console.log('✅ No deprecated items found!\n');
    return;
  }

  // By type table
  const byType = {};
  for (const result of results) {
    for (const item of result.deprecated) {
      byType[item.itemType] = (byType[item.itemType] || 0) + 1;
    }
  }

  console.log('### By Type\n');
  console.log('| Type | Count |');
  console.log('|------|-------|');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`| ${type} | ${count} |`);
  }
  console.log('');

  // Detailed list
  console.log('## Deprecated Items\n');

  for (const result of results) {
    if (result.deprecated.length === 0) {continue;}

    console.log(`### ${result.package}\n`);
    console.log(`| Item | Type | Location | Reason |`);
    console.log(`|------|------|----------|--------|`);

    for (const item of result.deprecated) {
      const relativePath = path.relative(rootDir, item.file);
      const location = `\`${relativePath}:${item.line}\``;
      const reason = item.reason.replace(/\|/g, '\\|').substring(0, 50);
      console.log(`| \`${item.itemName}\` | ${item.itemType} | ${location} | ${reason} |`);
    }
    console.log('');
  }
}

/**
 * Format output as stats only
 */
function formatStats(results) {
  const totalDeprecated = results.reduce((sum, r) => sum + r.deprecated.length, 0);
  const packagesWithDeprecated = results.filter((r) => r.deprecated.length > 0).length;

  const byType = {};
  const byRepo = {};
  for (const result of results) {
    for (const item of result.deprecated) {
      byType[item.itemType] = (byType[item.itemType] || 0) + 1;
    }
    if (result.deprecated.length > 0) {
      byRepo[result.repo] = (byRepo[result.repo] || 0) + result.deprecated.length;
    }
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          totalDeprecated,
          packagesWithDeprecated,
          totalPackages: results.length,
          byType,
          byRepo,
        },
        null,
        2
      )
    );
    return;
  }

  log('\n📊 Deprecated Code Statistics\n', 'blue');
  log(`   Total deprecated items: ${totalDeprecated}`, totalDeprecated > 0 ? 'yellow' : 'green');
  log(`   Packages affected: ${packagesWithDeprecated} / ${results.length}`, 'gray');

  if (totalDeprecated > 0) {
    log('\n   By Type:', 'cyan');
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      log(`      ${type}: ${count}`, 'gray');
    }

    log('\n   By Repository:', 'cyan');
    for (const [repo, count] of Object.entries(byRepo).sort((a, b) => b[1] - a[1])) {
      log(`      ${repo}: ${count}`, 'gray');
    }
  }

  log('', 'reset');
}

/**
 * Main function
 */
async function main() {
  try {
    const rootDir = process.cwd();

    if (!options.json && !options.md && !options.stats) {
      log('🔍 KB Labs Deprecated Code Checker\n', 'blue');
    }

    const packages = findPackages(rootDir, options.package);

    if (packages.length === 0) {
      log('❌ No packages found. Make sure you run this from kb-labs root directory.', 'red');
      process.exit(2);
    }

    if (!options.json && !options.md) {
      log(`Scanning ${packages.length} package(s)...`, 'gray');
    }

    const results = [];
    for (const pkg of packages) {
      const result = analyzePackage(pkg);
      results.push(result);
    }

    // Sort by deprecated count (most first)
    results.sort((a, b) => b.deprecated.length - a.deprecated.length);

    // Output based on format
    if (options.stats) {
      formatStats(results);
    } else if (options.json) {
      formatJSON(results, rootDir);
    } else if (options.md) {
      formatMarkdown(results, rootDir);
    } else {
      formatTable(results, rootDir);
    }

    // Exit with code 1 if deprecated items found (useful for CI awareness, not failure)
    const totalDeprecated = results.reduce((sum, r) => sum + r.deprecated.length, 0);
    process.exit(totalDeprecated > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(2);
  }
}

main();
