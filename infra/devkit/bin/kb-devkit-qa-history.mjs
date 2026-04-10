#!/usr/bin/env node

/**
 * KB Labs QA History Tracker
 * 
 * Tracks QA metrics over time and detects regressions.
 * 
 * Usage:
 *   npx kb-devkit-qa-history save           # Save current QA results
 *   npx kb-devkit-qa-history show           # Show history
 *   npx kb-devkit-qa-history trends         # Show trends
 *   npx kb-devkit-qa-history regressions    # Detect regressions
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const HISTORY_DIR = '.qa-history'
const HISTORY_FILE = join(HISTORY_DIR, 'history.json')

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

// Load history
function loadHistory() {
  if (!existsSync(HISTORY_FILE)) {
    return []
  }
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
  } catch (err) {
    log('Failed to load history', 'red')
    return []
  }
}

// Save history
function saveHistory(history) {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true })
  }
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2))
}

// Get current QA results from baseline files (no re-run!)
function getCurrentQA() {
  // Read baseline files directly
  const baseline = {
    build: existsSync('.baseline/build-failures.json') ? JSON.parse(readFileSync('.baseline/build-failures.json', 'utf-8')) : null,
    lint: existsSync('.baseline/lint-errors-aggregated.json') ? JSON.parse(readFileSync('.baseline/lint-errors-aggregated.json', 'utf-8')) : null,
    typeCheck: existsSync('.baseline/type-errors.json') ? JSON.parse(readFileSync('.baseline/type-errors.json', 'utf-8')) : null,
    test: existsSync('.baseline/test-results.json') ? JSON.parse(readFileSync('.baseline/test-results.json', 'utf-8')) : null,
  }

  // Extract failed packages from baseline
  const failures = {
    build: baseline.build?.failures || [],
    lint: baseline.lint?.packages?.filter(p => p.errors > 0 || p.warnings > 0).map(p => p.name) || [],
    typeCheck: baseline.typeCheck?.packages?.filter(p => p.errors > 0).map(p => p.name) || [],
    test: [], // No per-package test data
  }

  return {
    status: (failures.build.length + failures.lint.length + failures.typeCheck.length + failures.test.length) === 0 ? 'passed' : 'failed',
    filter: { package: null, repo: null, scope: null },
    summary: {
      build: { passed: 0, failed: failures.build.length, skipped: 0 },
      lint: { passed: 0, failed: failures.lint.length, skipped: 0 },
      typeCheck: { passed: 0, failed: failures.typeCheck.length, skipped: 0 },
      test: { passed: 0, failed: failures.test.length, skipped: 0 },
    },
    failures,
    baseline: null,
    byRepo: null,
  }
}

// Get git info
function getGitInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim()
    const message = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim()
    return { commit, branch, message }
  } catch (err) {
    return { commit: 'unknown', branch: 'unknown', message: '' }
  }
}

// Save current QA results to history
function saveCurrentQA() {
  log('\n📊 Reading baseline files...', 'cyan')
  const qa = getCurrentQA()
  const git = getGitInfo()

  const history = loadHistory()

  const entry = {
    timestamp: new Date().toISOString(),
    git,
    status: qa.status,
    filter: qa.filter, // NEW: Save filter info (package/repo/scope)
    summary: qa.summary,
    failures: {
      build: qa.failures.build.length,
      lint: qa.failures.lint.length,
      typeCheck: qa.failures.typeCheck.length,
      test: qa.failures.test.length,
    },
    // NEW: Save per-package failure lists
    failedPackages: {
      build: qa.failures.build || [],
      lint: qa.failures.lint || [],
      typeCheck: qa.failures.typeCheck || [],
      test: qa.failures.test || [],
    },
    baseline: qa.baseline,
    byRepo: qa.byRepo, // NEW: Save per-repo aggregation if available
  }

  history.push(entry)

  // Keep last 50 entries
  if (history.length > 50) {
    history.splice(0, history.length - 50)
  }

  saveHistory(history)

  log(`\n✅ QA results saved (${history.length} entries in history)`, 'green')
  log(`   Commit: ${git.commit} (${git.branch})`, 'gray')
  log(`   Status: ${qa.status === 'passed' ? '✅' : '❌'} ${qa.status}`, qa.status === 'passed' ? 'green' : 'red')

  // Show filter info if present
  if (qa.filter && (qa.filter.package || qa.filter.repo || qa.filter.scope)) {
    const filterStr = qa.filter.package || qa.filter.repo || qa.filter.scope
    log(`   Filter: ${filterStr}`, 'gray')
  }
}

// Show history
function showHistory() {
  const history = loadHistory()
  
  if (history.length === 0) {
    log('No QA history found. Run "npx kb-devkit-qa-history save" first.', 'yellow')
    return
  }
  
  log(`\n📊 QA History (last ${history.length} entries)\n`, 'cyan')
  log('─'.repeat(100), 'gray')
  log(`${'Date'.padEnd(20)} ${'Commit'.padEnd(10)} ${'Status'.padEnd(10)} ${'Build'.padEnd(8)} ${'Lint'.padEnd(8)} ${'Types'.padEnd(8)} ${'Tests'.padEnd(8)}`, 'bright')
  log('─'.repeat(100), 'gray')
  
  for (const entry of history.slice(-20)) {
    const date = new Date(entry.timestamp).toLocaleString()
    const status = entry.status === 'passed' ? '✅ passed' : '❌ failed'
    const statusColor = entry.status === 'passed' ? 'green' : 'red'
    
    const build = entry.failures.build
    const lint = entry.failures.lint
    const types = entry.failures.typeCheck
    const tests = entry.failures.test
    
    const buildStr = build === 0 ? `${colors.green}✓${colors.reset}` : `${colors.red}${build}F${colors.reset}`
    const lintStr = lint === 0 ? `${colors.green}✓${colors.reset}` : `${colors.red}${lint}F${colors.reset}`
    const typesStr = types === 0 ? `${colors.green}✓${colors.reset}` : `${colors.red}${types}F${colors.reset}`
    const testsStr = tests === 0 ? `${colors.green}✓${colors.reset}` : `${colors.red}${tests}F${colors.reset}`
    
    console.log(`${date.padEnd(20)} ${entry.git.commit.padEnd(10)} ${colors[statusColor]}${status.padEnd(10)}${colors.reset} ${buildStr.padEnd(8)} ${lintStr.padEnd(8)} ${typesStr.padEnd(8)} ${testsStr.padEnd(8)}`)
  }
  
  log('─'.repeat(100), 'gray')
}

// Show trends
function showTrends() {
  const history = loadHistory()
  
  if (history.length < 2) {
    log('Not enough history data. Need at least 2 entries.', 'yellow')
    return
  }
  
  log('\n📈 QA Trends\n', 'cyan')
  
  const recent = history.slice(-10)
  const first = recent[0]
  const last = recent[recent.length - 1]
  
  // Calculate trends
  const trends = {
    build: last.failures.build - first.failures.build,
    lint: last.failures.lint - first.failures.lint,
    typeCheck: last.failures.typeCheck - first.failures.typeCheck,
    test: last.failures.test - first.failures.test,
  }
  
  const categories = [
    { name: 'Build', key: 'build', icon: '🔨' },
    { name: 'Lint', key: 'lint', icon: '🔍' },
    { name: 'Type Check', key: 'typeCheck', icon: '📘' },
    { name: 'Tests', key: 'test', icon: '🧪' },
  ]
  
  for (const cat of categories) {
    const trend = trends[cat.key]
    const current = last.failures[cat.key]
    const previous = first.failures[cat.key]

    let trendStr = ''
    let trendColor = 'gray'

    if (trend > 0) {
      trendStr = `+${trend} ❌ (regression)`
      trendColor = 'red'
    } else if (trend < 0) {
      trendStr = `${trend} ✅ (improvement)`
      trendColor = 'green'
    } else {
      trendStr = '→ no change'
      trendColor = 'yellow'
    }

    log(`${cat.icon}  ${cat.name.padEnd(12)} ${previous} → ${current}  ${colors[trendColor]}${trendStr}${colors.reset}`)

    // Show package-level details if available
    if (last.failedPackages && first.failedPackages) {
      const previousFails = new Set(first.failedPackages[cat.key] || [])
      const currentFails = new Set(last.failedPackages[cat.key] || [])

      // New failures
      const newFails = [...currentFails].filter(pkg => !previousFails.has(pkg))
      if (newFails.length > 0) {
        log(`   🆕 New failures (${newFails.length}):`, 'red')
        for (const pkg of newFails.slice(0, 3)) {
          log(`     - ${pkg}`, 'red')
        }
        if (newFails.length > 3) {
          log(`     ... and ${newFails.length - 3} more`, 'gray')
        }
      }

      // Fixed packages
      const fixed = [...previousFails].filter(pkg => !currentFails.has(pkg))
      if (fixed.length > 0) {
        log(`   ✅ Fixed (${fixed.length}):`, 'green')
        for (const pkg of fixed.slice(0, 3)) {
          log(`     - ${pkg}`, 'green')
        }
        if (fixed.length > 3) {
          log(`     ... and ${fixed.length - 3} more`, 'gray')
        }
      }
    }
  }
  
  // NEW: Baseline trends for all check types
  if (last.baseline && first.baseline) {
    log('')
    log('📊 Baseline Trends:', 'cyan')

    const checkTypes = [
      { key: 'build', label: 'Build', icon: '🔨' },
      { key: 'lint', label: 'Lint', icon: '🔍' },
      { key: 'typeCheck', label: 'Type Check', icon: '📘' },
      { key: 'test', label: 'Tests', icon: '🧪' },
    ]

    for (const checkType of checkTypes) {
      const lastBaseline = last.baseline[checkType.key]
      const firstBaseline = first.baseline[checkType.key]

      if (!lastBaseline || !firstBaseline) {continue}

      const delta = lastBaseline.summary.current - firstBaseline.summary.current

      let trendStr = ''
      let trendColor = 'gray'

      if (delta > 0) {
        trendStr = `+${delta} ❌ (regression)`
        trendColor = 'red'
      } else if (delta < 0) {
        trendStr = `${delta} ✅ (improvement)`
        trendColor = 'green'
      } else {
        trendStr = '→ no change'
        trendColor = 'yellow'
      }

      log(`   ${checkType.icon}  ${checkType.label.padEnd(12)} ${firstBaseline.summary.current} → ${lastBaseline.summary.current}  ${colors[trendColor]}${trendStr}${colors.reset}`)
    }
  }
  
  log('')
  log(`Period: ${new Date(first.timestamp).toLocaleDateString()} → ${new Date(last.timestamp).toLocaleDateString()}`, 'gray')
}

// Detect regressions
function detectRegressions() {
  const history = loadHistory()

  if (history.length < 2) {
    log('Not enough history data. Need at least 2 entries.', 'yellow')
    return
  }

  const last = history[history.length - 1]
  const previous = history[history.length - 2]

  log('\n🔍 Regression Detection\n', 'cyan')
  log(`Comparing: ${previous.git.commit} → ${last.git.commit}`, 'gray')
  log('')

  let hasRegression = false

  // Check each category
  const categories = ['build', 'lint', 'typeCheck', 'test']

  for (const cat of categories) {
    const delta = last.failures[cat] - previous.failures[cat]

    if (delta > 0) {
      hasRegression = true
      log(`❌ ${cat}: +${delta} new failures`, 'red')

      // NEW: Show which packages regressed using failedPackages
      if (last.failedPackages && last.failedPackages[cat]) {
        const previousFails = new Set(previous.failedPackages?.[cat] || [])
        const newFails = last.failedPackages[cat].filter(pkg => !previousFails.has(pkg))

        if (newFails.length > 0) {
          log(`   New failures:`, 'red')
          for (const pkg of newFails.slice(0, 5)) {
            log(`     - ${pkg}`, 'red')
          }
          if (newFails.length > 5) {
            log(`     ... and ${newFails.length - 5} more`, 'gray')
          }
        }
      }
    } else if (delta < 0) {
      log(`✅ ${cat}: ${Math.abs(delta)} failures fixed`, 'green')

      // NEW: Show which packages were fixed
      if (previous.failedPackages && previous.failedPackages[cat]) {
        const currentFails = new Set(last.failedPackages?.[cat] || [])
        const fixed = previous.failedPackages[cat].filter(pkg => !currentFails.has(pkg))

        if (fixed.length > 0) {
          log(`   Fixed packages:`, 'green')
          for (const pkg of fixed.slice(0, 3)) {
            log(`     - ${pkg}`, 'green')
          }
          if (fixed.length > 3) {
            log(`     ... and ${fixed.length - 3} more`, 'gray')
          }
        }
      }
    }
  }

  // NEW: Check all baseline categories (not just typeCheck)
  if (last.baseline && previous.baseline) {
    const checkTypes = ['build', 'lint', 'typeCheck', 'test']

    for (const checkType of checkTypes) {
      const lastBaseline = last.baseline[checkType]
      const prevBaseline = previous.baseline[checkType]

      if (!lastBaseline || !prevBaseline) {continue}

      const delta = lastBaseline.summary.current - prevBaseline.summary.current

      if (delta > 0) {
        hasRegression = true
        log(`❌ ${checkType} baseline: +${delta} new failures`, 'red')

        if (lastBaseline.newFailures?.length > 0) {
          log(`   New failing packages:`, 'red')
          for (const pkg of lastBaseline.newFailures.slice(0, 5)) {
            log(`     - ${pkg}`, 'red')
          }
          if (lastBaseline.newFailures.length > 5) {
            log(`     ... and ${lastBaseline.newFailures.length - 5} more`, 'gray')
          }
        }
      } else if (delta < 0) {
        log(`✅ ${checkType} baseline: ${Math.abs(delta)} failures fixed`, 'green')
      }
    }
  }

  log('')

  if (hasRegression) {
    log('❌ REGRESSIONS DETECTED!', 'red')
    log('', '')
    log('Recommendations:', 'yellow')
    log('  1. Run "npx kb-devkit-qa --json" to see details', 'yellow')
    log('  2. Fix new failures before merging', 'yellow')
    log('  3. Update baseline if improvements: "pnpm baseline:update"', 'yellow')
    process.exit(1)
  } else {
    log('✅ No regressions detected', 'green')
    process.exit(0)
  }
}

// Main
function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'show'

  switch (command) {
    case 'save':
      saveCurrentQA()
      break
    case 'show':
      showHistory()
      break
    case 'trends':
      showTrends()
      break
    case 'regressions':
      detectRegressions()
      break
    default:
      log('Usage:', 'yellow')
      log('  npx kb-devkit-qa-history save [--from-file qa-results.json]  # Save QA results', 'gray')
      log('  npx kb-devkit-qa-history show                                # Show history', 'gray')
      log('  npx kb-devkit-qa-history trends                              # Show trends', 'gray')
      log('  npx kb-devkit-qa-history regressions                         # Detect regressions', 'gray')
      break
  }
}

main()
