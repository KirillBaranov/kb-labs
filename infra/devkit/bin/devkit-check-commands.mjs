#!/usr/bin/env node

/**
 * @kb-labs/devkit - Command Health Checker
 *
 * Automatically checks all CLI commands in the ecosystem.
 * Ensures commands don't break silently.
 *
 * Usage:
 *   kb-devkit-check-commands              # Check all commands
 *   kb-devkit-check-commands --fast       # Quick check (only --help)
 *   kb-devkit-check-commands --timeout 10 # Custom timeout (seconds)
 *   kb-devkit-check-commands --json       # Output JSON
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Shared package discovery — supports both flat and categorized layouts
import { findPackages } from './lib/find-packages.mjs';

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
  fast: args.includes('--fast'),
  json: args.includes('--json'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  timeout: parseInt(args.find((arg) => arg.startsWith('--timeout='))?.split('=')[1] || '5', 10) * 1000,
};

/**
 * Find all plugin manifests in monorepo
 */
function findPluginManifests(rootDir) {
  return findPackages(rootDir)
    .map((pkgPath) => {
      const manifestPath = path.join(path.dirname(pkgPath), 'manifest.json');
      return fs.existsSync(manifestPath) ? manifestPath : null;
    })
    .filter(Boolean);
}

/**
 * Get list of all commands from plugin manifests
 */
function getAllCommands() {
  const rootDir = process.cwd();
  const manifests = findPluginManifests(rootDir);

  if (manifests.length === 0) {
    log('⚠️  No plugin manifests found', 'yellow');
    log('   Looking for kb-labs-*/packages/*/manifest.json files', 'gray');
    return [];
  }

  const commands = new Set();

  for (const manifestPath of manifests) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Extract commands from manifest
      if (manifest.commands && Array.isArray(manifest.commands)) {
        for (const command of manifest.commands) {
          if (command.name) {
            commands.add(command.name);
          }
        }
      }
    } catch (error) {
      // Skip invalid manifests
      continue;
    }
  }

  // Also try to get commands from `pnpm kb plugins commands` as fallback
  try {
    const output = execSync('pnpm kb plugins commands 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 10000,
    });

    const lines = output.split('\n');

    for (const line of lines) {
      // Match lines like: "  plugins:list - Description"
      const match = line.match(/^\s+([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)\s+-\s+/);
      if (match) {
        commands.add(match[1]);
      }

      // Also match product-level commands without colons
      const productMatch = line.match(/^\s+([a-z][a-z0-9-]*)\s+-\s+/);
      if (productMatch && !productMatch[1].includes(':')) {
        commands.add(productMatch[1]);
      }
    }
  } catch (error) {
    // CLI might be broken, that's okay - we have manifests
  }

  return Array.from(commands).sort();
}

/**
 * Check if a command works by running it with --help
 */
function checkCommand(command) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn('pnpm', ['kb', command, '--help'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeout);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      let status = 'working';
      let error = null;

      if (timedOut) {
        status = 'timeout';
        error = `Timeout after ${options.timeout}ms`;
      } else if (code !== 0) {
        status = 'error';
        error = `Exit code: ${code}`;
        if (stderr) {
          // Extract meaningful error from stderr
          const errorLines = stderr.split('\n').filter((line) => line.trim());
          if (errorLines.length > 0) {
            error = errorLines[0].substring(0, 200); // First error line, max 200 chars
          }
        }
      } else if (!stdout || stdout.trim().length === 0) {
        status = 'empty';
        error = 'No output (empty help)';
      } else if (stderr && stderr.includes('Error:')) {
        status = 'warning';
        error = 'Has errors in stderr';
      }

      resolve({
        command,
        status,
        error,
        duration,
        stdout: stdout.substring(0, 500), // Keep first 500 chars for debugging
        stderr: stderr.substring(0, 500),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        command,
        status: 'error',
        error: err.message,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Check all commands
 */
async function checkAllCommands(commands) {
  const results = [];
  const total = commands.length;

  for (let i = 0; i < total; i++) {
    const command = commands[i];

    if (!options.json) {
      process.stdout.write(
        `\r${colors.gray}Checking commands... ${i + 1}/${total} (${Math.round((i / total) * 100)}%)${colors.reset}`
      );
    }

    const result = await checkCommand(command);
    results.push(result);
  }

  if (!options.json) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear progress line
  }

  return results;
}

/**
 * Print results
 */
function printResults(results) {
  const working = results.filter((r) => r.status === 'working');
  const broken = results.filter((r) => r.status !== 'working');
  const errors = results.filter((r) => r.status === 'error');
  const timeouts = results.filter((r) => r.status === 'timeout');
  const empty = results.filter((r) => r.status === 'empty');
  const warnings = results.filter((r) => r.status === 'warning');

  log('\n🔍 KB Labs Command Health Checker\n', 'bold');
  log(`Found ${results.length} command(s) to check\n`, 'gray');

  // Show working commands (only in verbose mode)
  if (options.verbose && working.length > 0) {
    log('✅ Working commands (' + working.length + '):', 'green');
    for (const result of working.slice(0, 10)) {
      log(`   kb ${result.command}`, 'gray');
    }
    if (working.length > 10) {
      log(`   ... and ${working.length - 10} more`, 'gray');
    }
    log('', 'reset');
  }

  // Show broken commands
  if (broken.length > 0) {
    log(`❌ Broken commands (${broken.length}):\n`, 'red');

    for (const result of broken) {
      const icon =
        result.status === 'timeout' ? '⏱️'
        : result.status === 'empty' ? '📭'
        : result.status === 'warning' ? '⚠️'
        : '❌';

      log(`   ${icon} kb ${result.command} --help`, 'yellow');
      log(`      └─ ${result.error}`, 'gray');

      if (options.verbose && result.stderr) {
        const stderrLines = result.stderr.split('\n').filter((l) => l.trim());
        if (stderrLines.length > 0) {
          log(`      └─ stderr: ${stderrLines[0].substring(0, 100)}`, 'gray');
        }
      }
    }
    log('', 'reset');
  }

  // Summary
  log('─'.repeat(60) + '\n', 'gray');
  log('📊 Summary:\n', 'blue');

  const percentage = Math.round((working.length / results.length) * 100);
  log(`   Total commands:  ${results.length}`, 'cyan');
  log(`   ✅ Working:      ${working.length} (${percentage}%)`, 'green');

  if (errors.length > 0) {
    log(`   ❌ Errors:       ${errors.length}`, 'red');
  }
  if (timeouts.length > 0) {
    log(`   ⏱️  Timeouts:     ${timeouts.length}`, 'yellow');
  }
  if (empty.length > 0) {
    log(`   📭 Empty output: ${empty.length}`, 'yellow');
  }
  if (warnings.length > 0) {
    log(`   ⚠️  Warnings:     ${warnings.length}`, 'yellow');
  }

  log('', 'reset');

  // Tips
  if (broken.length > 0) {
    log('💡 Tips:', 'blue');
    log('   • Run with --verbose to see detailed error messages', 'gray');
    log('   • Run with --timeout=10 to increase timeout for slow commands', 'gray');
    log('   • Check package.json dependencies for broken commands', 'gray');
    log('', 'reset');
  }
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();

  if (!options.json) {
    log('\n🚀 KB Labs Command Health Checker\n', 'bold');
    log('Getting command list from `pnpm kb plugins commands`...\n', 'gray');
  }

  // Get all commands
  const commands = getAllCommands();

  if (commands.length === 0) {
    log('⚠️  No commands found', 'yellow');
    log('   Make sure you are in the kb-labs monorepo root', 'gray');
    log('   And that `pnpm kb plugins commands` works', 'gray');
    process.exit(1);
  }

  // Check all commands
  const results = await checkAllCommands(commands);

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  if (options.json) {
    // JSON output for CI parsing
    const working = results.filter((r) => r.status === 'working');
    const broken = results.filter((r) => r.status !== 'working');

    const output = {
      summary: {
        total: results.length,
        working: working.length,
        broken: broken.length,
        percentage: Math.round((working.length / results.length) * 100),
        duration: parseFloat(totalDuration),
      },
      commands: results.map((r) => ({
        command: r.command,
        status: r.status,
        error: r.error,
        duration: r.duration,
      })),
      broken: broken.map((r) => ({
        command: r.command,
        status: r.status,
        error: r.error,
      })),
    };

    console.log(JSON.stringify(output, null, 2));
  } else {
    printResults(results);

    log(`⏱️  Duration: ${totalDuration}s\n`, 'gray');
  }

  // Exit with error if any commands are broken
  const broken = results.filter((r) => r.status !== 'working');
  process.exit(broken.length > 0 ? 1 : 0);
}

main();
