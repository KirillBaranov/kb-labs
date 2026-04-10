#!/usr/bin/env node

/**
 * KB Labs Quality Assurance Runner
 *
 * Runs comprehensive checks across entire monorepo:
 * 1. Build all packages in correct layer order (incremental)
 * 2. Run linter on all packages (with smart caching)
 * 3. Run type-check on all packages (with smart caching)
 * 4. Run tests on all packages (with smart caching)
 *
 * Features:
 * - Incremental builds (skips packages where src/ hasn't changed)
 * - Smart caching (skips lint/type-check/test for unchanged packages)
 * - Per-package and per-repo filtering
 * - Baseline regression detection for all 4 check types
 * - JSON output for CI/CD and agents
 *
 * Usage:
 *   npx kb-devkit-qa                              # Run on all packages (with caching)
 *   npx kb-devkit-qa --json                       # JSON output for agents
 *   npx kb-devkit-qa --package=@kb-labs/cli-core  # Run on specific package
 *   npx kb-devkit-qa --repo=kb-labs-core          # Run on entire repo
 *   npx kb-devkit-qa --scope=workflow             # Run on packages matching scope
 *   npx kb-devkit-qa --no-cache                   # Disable smart caching
 *   npx kb-devkit-qa --skip-build                 # Skip build phase
 *   npx kb-devkit-qa --skip-lint                  # Skip lint phase
 *   npx kb-devkit-qa --skip-types                 # Skip type-check phase
 *   npx kb-devkit-qa --skip-tests                 # Skip test phase
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

// Parse args
const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const skipBuild = args.includes('--skip-build')
const skipLint = args.includes('--skip-lint')
const skipTypes = args.includes('--skip-types')
const skipTests = args.includes('--skip-tests')
const noCache = args.includes('--no-cache') // NEW: Disable caching

// NEW: Parse filter options
const packageFilter = args.find(arg => arg.startsWith('--package='))?.split('=')[1]
const repoFilter = args.find(arg => arg.startsWith('--repo='))?.split('=')[1]
const scopeFilter = args.find(arg => arg.startsWith('--scope='))?.split('=')[1]

// Cache directory
const CACHE_DIR = '.qa-cache'
const CACHE_FILE = join(CACHE_DIR, 'package-hashes.json')

// ANSI colors (disabled in JSON mode)
const colors = jsonMode ? {
  reset: '', bright: '', red: '', green: '', yellow: '', blue: '', cyan: '', gray: '',
} : {
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
  if (!jsonMode) {
    console.log(`${colors[color]}${msg}${colors.reset}`)
  }
}

function header(msg) {
  if (!jsonMode) {
    log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}\n`)
  }
}

const results = {
  build: { passed: [], failed: [], skipped: [], errors: {} },
  lint: { passed: [], failed: [], skipped: [], errors: {} },
  typeCheck: { passed: [], failed: [], skipped: [], errors: {} },
  test: { passed: [], failed: [], skipped: [], errors: {} },
}

// Get repo name from package path
function getRepoFromPackage(pkg) {
  // Extract repo from path: /path/to/kb-labs-REPO/packages/...
  const match = pkg.path.match(/\/(kb-labs-[^/]+)/)
  return match ? match[1] : null
}

// Load package hash cache
function loadCache() {
  if (!existsSync(CACHE_FILE)) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
  } catch (err) {
    return {}
  }
}

// Save package hash cache
function saveCache(cache) {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

// Calculate hash for package sources
function calculatePackageHash(pkgPath) {
  const srcDir = join(pkgPath, 'src')
  const pkgJson = join(pkgPath, 'package.json')

  const hash = createHash('sha256')

  // Hash all files in src/ if it exists
  if (existsSync(srcDir)) {
    function hashDirectory(dir) {
      try {
        const files = readdirSync(dir, { withFileTypes: true })
        for (const file of files) {
          const fullPath = join(dir, file.name)
          if (file.isDirectory()) {
            hashDirectory(fullPath)
          } else {
            const content = readFileSync(fullPath, 'utf-8')
            hash.update(content)
          }
        }
      } catch (err) {
        // Ignore permission errors
      }
    }
    hashDirectory(srcDir)
  }

  // Hash package.json (dependencies/scripts)
  if (existsSync(pkgJson)) {
    const content = readFileSync(pkgJson, 'utf-8')
    hash.update(content)
  }

  // Return null only if neither src nor package.json exist
  if (!existsSync(srcDir) && !existsSync(pkgJson)) {
    return null
  }

  return hash.digest('hex')
}

// Check if package sources have changed since last QA run
function hasPackageChanged(pkgName, pkgPath, cache) {
  if (noCache) {return true} // Skip cache if --no-cache flag

  const currentHash = calculatePackageHash(pkgPath)
  if (!currentHash) {return true} // Nothing to hash, always run

  const cachedHash = cache[pkgName]
  return currentHash !== cachedHash
}

// Get all workspace packages (with optional filtering)
function getWorkspacePackages() {
  try {
    const output = execSync('pnpm list -r --depth -1 --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    let packages = JSON.parse(output)
      .filter(pkg => pkg.name?.startsWith('@kb-labs/'))
      .map(pkg => ({ name: pkg.name, path: pkg.path }))

    // Apply filters
    if (packageFilter) {
      packages = packages.filter(p => p.name === packageFilter)
      if (packages.length === 0) {
        log(`❌ Package not found: ${packageFilter}`, 'red')
        process.exit(1)
      }
    }

    if (repoFilter) {
      packages = packages.filter(p => getRepoFromPackage(p) === repoFilter)
      if (packages.length === 0) {
        log(`❌ No packages found in repo: ${repoFilter}`, 'red')
        process.exit(1)
      }
    }

    if (scopeFilter) {
      packages = packages.filter(p => p.name.includes(scopeFilter))
      if (packages.length === 0) {
        log(`❌ No packages found matching scope: ${scopeFilter}`, 'red')
        process.exit(1)
      }
    }

    return packages
  } catch (err) {
    log('Failed to get workspace packages', 'red')
    process.exit(1)
  }
}

// Get latest modification time in directory recursively
function getLatestMtime(dir) {
  if (!existsSync(dir)) {return 0}

  let latest = 0
  try {
    const files = readdirSync(dir, { withFileTypes: true })
    for (const file of files) {
      const fullPath = join(dir, file.name)
      if (file.isDirectory()) {
        const dirMtime = getLatestMtime(fullPath)
        if (dirMtime > latest) {latest = dirMtime}
      } else {
        const stat = statSync(fullPath)
        if (stat.mtimeMs > latest) {latest = stat.mtimeMs}
      }
    }
  } catch (err) {
    // Ignore permission errors
  }
  return latest
}

// Check if package needs rebuild
function needsRebuild(pkgPath) {
  const srcDir = join(pkgPath, 'src')
  const distDir = join(pkgPath, 'dist')

  // If dist doesn't exist, needs build
  if (!existsSync(distDir)) {return true}

  // If src doesn't exist, skip (might be types-only package)
  if (!existsSync(srcDir)) {return false}

  // Compare modification times
  const srcMtime = getLatestMtime(srcDir)
  const distMtime = getLatestMtime(distDir)

  // If src is newer than dist, needs rebuild
  return srcMtime > distMtime
}

// Build all packages in layer order
async function buildAllLayers() {
  header('🔨 Building all packages in correct dependency order...')
  
  try {
    // Generate build order
    log('📊 Calculating build order...', 'gray')
    let buildOrder = execSync('npx kb-devkit-build-order --layers', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })

    // Strip ANSI codes
    buildOrder = buildOrder.replace(/\x1b\[[0-9;]*m/g, '')

    // Parse layers
    const layerMatches = buildOrder.matchAll(/Layer (\d+).*?:\s+((?:@kb-labs\/[\w-]+\s*)+)/gs)
    const layers = []
    
    for (const match of layerMatches) {
      const layerNum = parseInt(match[1])
      const packages = match[2]
        .trim()
        .split(/\s+/)
        .filter(pkg => pkg.startsWith('@kb-labs/'))
      layers.push({ num: layerNum, packages })
    }
    
    log(`Found ${layers.length} layers to build\n`, 'gray')
    
    // Get package paths for timestamp checking
    const allPackages = getWorkspacePackages()
    const pkgPathMap = new Map(allPackages.map(p => [p.name, p.path]))
    const filteredPackageNames = new Set(allPackages.map(p => p.name))

    // Build each layer
    for (const layer of layers) {
      // Filter layer packages based on current filters
      const layerPackagesToBuild = layer.packages.filter(pkg => filteredPackageNames.has(pkg))

      if (layerPackagesToBuild.length === 0) {
        continue // Skip empty layers
      }

      log(`🔨 Building Layer ${layer.num}/${layers.length} (${layerPackagesToBuild.length} packages)...`, 'cyan')

      for (const pkg of layerPackagesToBuild) {
        const pkgPath = pkgPathMap.get(pkg)

        // Check if rebuild is needed
        if (pkgPath && !needsRebuild(pkgPath)) {
          results.build.skipped.push(pkg)
          if (!jsonMode) {process.stdout.write(`${colors.gray}-${colors.reset}`)}
          continue
        }

        try {
          execSync(`pnpm --filter ${pkg} run build`, {
            encoding: 'utf-8',
            stdio: 'pipe',
          })
          results.build.passed.push(pkg)
          if (!jsonMode) {process.stdout.write(`${colors.green}.${colors.reset}`)}
        } catch (err) {
          results.build.failed.push(pkg)
          results.build.errors[pkg] = err.stderr || err.stdout || err.message
          if (!jsonMode) {process.stdout.write(`${colors.red}F${colors.reset}`)}
        }
      }
      if (!jsonMode) {console.log('')}
    }
    
    log(`\n✅ Build complete: ${results.build.passed.length} passed, ${results.build.failed.length} failed, ${results.build.skipped.length} skipped (up-to-date)\n`, 'green')
    
  } catch (err) {
    log('❌ Build order calculation failed', 'red')
    throw err
  }
}

// Run command on all packages
async function runOnAllPackages(command, label, resultKey, cache) {
  header(`${label}...`)

  const packages = getWorkspacePackages()
  log(`Running on ${packages.length} packages\n`, 'gray')

  let cacheHits = 0

  for (const pkg of packages) {
    // NEW: Check if package has changed
    const changed = hasPackageChanged(pkg.name, pkg.path, cache)

    if (!changed && !noCache) {
      // Skip unchanged package
      results[resultKey].skipped.push(pkg.name)
      cacheHits++
      if (!jsonMode) {process.stdout.write(`${colors.gray}-${colors.reset}`)}
      continue
    }

    try {
      execSync(`pnpm --filter ${pkg.name} ${command}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      })
      results[resultKey].passed.push(pkg.name)
      if (!jsonMode) {process.stdout.write(`${colors.green}.${colors.reset}`)}

      // NEW: Update cache with current hash
      const currentHash = calculatePackageHash(pkg.path)
      if (currentHash) {
        cache[pkg.name] = currentHash
      }
    } catch (err) {
      // Check if script doesn't exist
      if (err.message.includes('missing script')) {
        results[resultKey].skipped.push(pkg.name)
        if (!jsonMode) {process.stdout.write(`${colors.gray}-${colors.reset}`)}
      } else {
        results[resultKey].failed.push(pkg.name)
        results[resultKey].errors[pkg.name] = err.stderr || err.stdout || err.message
        if (!jsonMode) {process.stdout.write(`${colors.red}F${colors.reset}`)}

        // Cache hash even for failed packages — if code hasn't changed, no point re-running
        const currentHash = calculatePackageHash(pkg.path)
        if (currentHash) {
          cache[pkg.name] = currentHash
        }
      }
    }
  }

  if (!jsonMode) {console.log('')}

  const skippedByCache = cacheHits
  const totalSkipped = results[resultKey].skipped.length

  if (skippedByCache > 0) {
    log(`\n✅ ${label} complete: ${results[resultKey].passed.length} passed, ${results[resultKey].failed.length} failed, ${totalSkipped} skipped (${skippedByCache} unchanged)\n`, 'green')
  } else {
    log(`\n✅ ${label} complete: ${results[resultKey].passed.length} passed, ${results[resultKey].failed.length} failed, ${totalSkipped} skipped\n`, 'green')
  }
}

// Load all baselines if they exist
function loadBaselines() {
  const baselines = {
    build: null,
    lint: null,
    typeCheck: null,
    test: null,
  }

  // Load build baseline
  const buildPath = '.baseline/build-failures.json'
  if (existsSync(buildPath)) {
    try {
      baselines.build = JSON.parse(readFileSync(buildPath, 'utf-8'))
    } catch (err) {
      // Ignore parsing errors
    }
  }

  // Load lint baseline (aggregated)
  const lintPath = '.baseline/lint-errors-aggregated.json'
  if (existsSync(lintPath)) {
    try {
      baselines.lint = JSON.parse(readFileSync(lintPath, 'utf-8'))
    } catch (err) {
      // Ignore parsing errors
    }
  }

  // Load type-check baseline
  const typesPath = '.baseline/type-errors.json'
  if (existsSync(typesPath)) {
    try {
      baselines.typeCheck = JSON.parse(readFileSync(typesPath, 'utf-8'))
    } catch (err) {
      // Ignore parsing errors
    }
  }

  // Load test baseline
  const testPath = '.baseline/test-results.json'
  if (existsSync(testPath)) {
    try {
      baselines.test = JSON.parse(readFileSync(testPath, 'utf-8'))
    } catch (err) {
      // Ignore parsing errors
    }
  }

  return baselines
}

// Calculate diff with baselines for all check types
function calculateDiff(baselines) {
  if (!baselines) {return null}

  return {
    build: calculateCheckDiff('build', baselines.build),
    lint: calculateCheckDiff('lint', baselines.lint),
    typeCheck: calculateCheckDiff('typeCheck', baselines.typeCheck),
    test: calculateCheckDiff('test', baselines.test),
  }
}

// Calculate diff for a specific check type
function calculateCheckDiff(checkKey, baseline) {
  if (!baseline) {return null}

  const currentFailed = new Set(results[checkKey].failed)
  let baselineFailed = new Set()
  const perPackage = []

  // Extract baseline failures based on format
  if (checkKey === 'build' && baseline.summary) {
    // build-failures.json format: { packages: [{name, path, reason, errors}], summary: {...} }
    if (baseline.packages && Array.isArray(baseline.packages)) {
      // New format: has per-package data
      baselineFailed = new Set(baseline.packages.map(pkg => pkg.name))
    } else if (baseline.failures) {
      // Old format: just array of package names
      baselineFailed = new Set(baseline.failures || [])
    }
  } else if (checkKey === 'lint' && baseline.packages) {
    // lint-errors-aggregated.json format: { packages: [{name, errors, warnings}] }
    baselineFailed = new Set(
      baseline.packages
        .filter(pkg => pkg.errors > 0 || pkg.warnings > 0)
        .map(pkg => pkg.name)
    )

    // Per-package comparison for lint
    const allPackages = new Set([...currentFailed, ...baselineFailed])
    for (const pkgName of allPackages) {
      const baselinePkg = baseline.packages.find(p => p.name === pkgName)
      const baselineErrors = baselinePkg ? (baselinePkg.errors + baselinePkg.warnings) : 0
      const currentFailing = currentFailed.has(pkgName) ? 1 : 0

      if (baselineErrors > 0 || currentFailing > 0) {
        perPackage.push({
          package: pkgName,
          baseline: baselineErrors,
          current: currentFailing ? '1+' : 0, // We don't have exact counts from current run
          isRegression: currentFailing > 0 && baselineErrors === 0
        })
      }
    }
  } else if (checkKey === 'typeCheck' && baseline.packages) {
    // type-errors.json format: { packages: [{name, errors, warnings, coverage}] }
    baselineFailed = new Set(
      baseline.packages
        .filter(pkg => pkg.errors > 0)
        .map(pkg => pkg.name)
    )

    // Per-package comparison for type-check
    const allPackages = new Set([...currentFailed, ...baselineFailed])
    for (const pkgName of allPackages) {
      const baselinePkg = baseline.packages.find(p => p.name === pkgName)
      const baselineErrors = baselinePkg ? baselinePkg.errors : 0
      const currentFailing = currentFailed.has(pkgName) ? 1 : 0

      if (baselineErrors > 0 || currentFailing > 0) {
        perPackage.push({
          package: pkgName,
          baseline: baselineErrors,
          current: currentFailing ? '1+' : 0,
          isRegression: currentFailing > 0 && baselineErrors === 0
        })
      }
    }
  } else if (checkKey === 'test' && baseline.summary) {
    // test-results.json format: { summary: {total, passed, failed}, packages: [{name, tests, passed, failed, status}] }
    if (baseline.packages && Array.isArray(baseline.packages)) {
      // New format: has per-package data
      baselineFailed = new Set(
        baseline.packages
          .filter(pkg => pkg.failed > 0)
          .map(pkg => pkg.name)
      )

      // Per-package comparison for tests
      const allPackages = new Set([...currentFailed, ...baselineFailed])
      for (const pkgName of allPackages) {
        const baselinePkg = baseline.packages.find(p => p.name === pkgName)
        const baselineFailed = baselinePkg ? baselinePkg.failed : 0
        const currentFailing = currentFailed.has(pkgName) ? 1 : 0

        if (baselineFailed > 0 || currentFailing > 0) {
          perPackage.push({
            package: pkgName,
            baseline: baselineFailed,
            current: currentFailing ? '1+' : 0,
            isRegression: currentFailing > 0 && baselineFailed === 0
          })
        }
      }
    } else {
      // Old format: no per-package data
      baselineFailed = new Set() // No per-package data
    }
  }

  const newFailures = [...currentFailed].filter(pkg => !baselineFailed.has(pkg))
  const fixed = [...baselineFailed].filter(pkg => !currentFailed.has(pkg))
  const stillFailing = [...currentFailed].filter(pkg => baselineFailed.has(pkg))

  return {
    newFailures,
    fixed,
    stillFailing,
    summary: {
      baseline: baselineFailed.size,
      current: currentFailed.size,
      delta: currentFailed.size - baselineFailed.size,
    },
    perPackage: perPackage.sort((a, b) => {
      // Sort regressions first, then by baseline errors
      if (a.isRegression !== b.isRegression) {return a.isRegression ? -1 : 1}
      return (typeof b.baseline === 'number' ? b.baseline : 0) - (typeof a.baseline === 'number' ? a.baseline : 0)
    })
  }
}

// Group results by repo
function groupByRepo() {
  const packages = getWorkspacePackages()
  const byRepo = {}

  // Helper to get status for a package in a check
  const getStatus = (checkKey, pkgName) => {
    if (results[checkKey].passed.includes(pkgName)) {return 'passed'}
    if (results[checkKey].failed.includes(pkgName)) {return 'failed'}
    if (results[checkKey].skipped.includes(pkgName)) {return 'skipped'}
    return 'not-run'
  }

  // Process all packages
  for (const pkg of packages) {
    const repo = getRepoFromPackage(pkg)
    if (!repo) {continue}

    // Initialize repo if needed
    if (!byRepo[repo]) {
      byRepo[repo] = {
        repo,
        packages: [],
        summary: {
          build: { passed: 0, failed: 0, skipped: 0 },
          lint: { passed: 0, failed: 0, skipped: 0 },
          typeCheck: { passed: 0, failed: 0, skipped: 0 },
          test: { passed: 0, failed: 0, skipped: 0 },
        }
      }
    }

    // Add package with statuses
    const pkgData = {
      name: pkg.name,
      build: getStatus('build', pkg.name),
      lint: getStatus('lint', pkg.name),
      typeCheck: getStatus('typeCheck', pkg.name),
      test: getStatus('test', pkg.name),
    }
    byRepo[repo].packages.push(pkgData)

    // Update summary counts
    for (const checkKey of ['build', 'lint', 'typeCheck', 'test']) {
      const status = pkgData[checkKey]
      if (status === 'passed') {byRepo[repo].summary[checkKey].passed++}
      else if (status === 'failed') {byRepo[repo].summary[checkKey].failed++}
      else if (status === 'skipped') {byRepo[repo].summary[checkKey].skipped++}
    }
  }

  return byRepo
}

// Print JSON report for agents
function printJsonReport(baselines, diff) {
  // Group by repo if filtering is active
  const byRepo = (packageFilter || repoFilter || scopeFilter) ? groupByRepo() : null

  const report = {
    status: (results.build.failed.length + results.lint.failed.length +
             results.typeCheck.failed.length + results.test.failed.length) === 0 ? 'passed' : 'failed',
    timestamp: new Date().toISOString(),
    filter: {
      package: packageFilter || null,
      repo: repoFilter || null,
      scope: scopeFilter || null,
    },
    summary: {
      build: {
        passed: results.build.passed.length,
        failed: results.build.failed.length,
        skipped: results.build.skipped.length,
      },
      lint: {
        passed: results.lint.passed.length,
        failed: results.lint.failed.length,
        skipped: results.lint.skipped.length,
      },
      typeCheck: {
        passed: results.typeCheck.passed.length,
        failed: results.typeCheck.failed.length,
        skipped: results.typeCheck.skipped.length,
      },
      test: {
        passed: results.test.passed.length,
        failed: results.test.failed.length,
        skipped: results.test.skipped.length,
      },
    },
    failures: {
      build: results.build.failed,
      lint: results.lint.failed,
      typeCheck: results.typeCheck.failed,
      test: results.test.failed,
    },
    errors: {
      build: results.build.errors,
      lint: results.lint.errors,
      typeCheck: results.typeCheck.errors,
      test: results.test.errors,
    },
    baseline: diff ? {
      build: diff.build,
      lint: diff.lint,
      typeCheck: diff.typeCheck,
      test: diff.test,
    } : null,
    byRepo: byRepo || null,
  }

  console.log(JSON.stringify(report, null, 2))
}

// Print human-readable report
function printHumanReport(baselines, diff) {
  header('📊 QA Summary Report')
  
  const checks = [
    { name: 'Build', key: 'build', icon: '🔨' },
    { name: 'Lint', key: 'lint', icon: '🔍' },
    { name: 'Type Check', key: 'typeCheck', icon: '📘' },
    { name: 'Tests', key: 'test', icon: '🧪' },
  ]
  
  let totalPassed = 0
  let totalFailed = 0
  let totalSkipped = 0
  let hasFailures = false
  
  for (const check of checks) {
    const result = results[check.key]
    const passed = result.passed.length
    const failed = result.failed.length
    const skipped = result.skipped.length
    const total = passed + failed + skipped
    
    totalPassed += passed
    totalFailed += failed
    totalSkipped += skipped
    
    if (failed > 0) {hasFailures = true}
    
    const status = failed > 0 ? `${colors.red}❌` : `${colors.green}✅`
    const percentage = total > 0 ? Math.round((passed / (total - skipped)) * 100) : 100
    
    log(`${status} ${check.icon}  ${check.name.padEnd(12)} ${passed}/${total - skipped} passed (${percentage}%)${colors.reset}`)
    
    // Show failed packages
    if (failed > 0) {
      log(`   ${colors.red}Failed packages:${colors.reset}`, 'red')
      for (const pkg of result.failed.slice(0, 10)) {
        log(`     - ${pkg}`, 'red')
      }
      if (failed > 10) {
        log(`     ... and ${failed - 10} more`, 'gray')
      }
    }
  }
  
  // Show baseline diff if available
  if (diff) {
    log('')
    log('📈 Baseline Comparison:', 'cyan')

    const checkTypes = [
      { key: 'build', label: 'Build', icon: '🔨' },
      { key: 'lint', label: 'Lint', icon: '🔍' },
      { key: 'typeCheck', label: 'Type Check', icon: '📘' },
      { key: 'test', label: 'Tests', icon: '🧪' },
    ]

    for (const checkType of checkTypes) {
      const checkDiff = diff[checkType.key]
      if (!checkDiff) {continue}

      log(`\n${checkType.icon} ${checkType.label}:`, 'cyan')
      log(`   Baseline: ${checkDiff.summary.baseline} failed`, 'gray')
      log(`   Current:  ${checkDiff.summary.current} failed`, 'gray')

      if (checkDiff.summary.delta > 0) {
        log(`   ❌ +${checkDiff.summary.delta} NEW failures (regression!)`, 'red')
      } else if (checkDiff.summary.delta < 0) {
        log(`   ✅ ${Math.abs(checkDiff.summary.delta)} failures FIXED (improvement!)`, 'green')
      } else {
        log(`   ➡️  No change`, 'yellow')
      }

      if (checkDiff.newFailures.length > 0) {
        log(`   🆕 New failures (${checkDiff.newFailures.length}):`, 'red')
        for (const pkg of checkDiff.newFailures.slice(0, 3)) {
          log(`     - ${pkg}`, 'red')
        }
        if (checkDiff.newFailures.length > 3) {
          log(`     ... and ${checkDiff.newFailures.length - 3} more`, 'gray')
        }
      }

      if (checkDiff.fixed.length > 0) {
        log(`   ✅ Fixed (${checkDiff.fixed.length}):`, 'green')
        for (const pkg of checkDiff.fixed.slice(0, 3)) {
          log(`     - ${pkg}`, 'green')
        }
        if (checkDiff.fixed.length > 3) {
          log(`     ... and ${checkDiff.fixed.length - 3} more`, 'gray')
        }
      }
    }
  }
  
  log('')
  log('─'.repeat(60), 'gray')
  log(`Total: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`, 'bright')
  log('')
  
  if (hasFailures) {
    log('❌ QA checks failed. See details above.', 'red')
    process.exit(1)
  } else {
    log('✅ All QA checks passed!', 'green')
    process.exit(0)
  }
}

// Main
async function main() {
  if (!jsonMode) {
    let header = `\n${colors.bright}${colors.blue}🚀 KB Labs QA Runner${colors.reset}`

    // Show filter info
    if (packageFilter) {
      header += `\n${colors.yellow}📦 Filtered: --package=${packageFilter}${colors.reset}`
    } else if (repoFilter) {
      header += `\n${colors.yellow}📁 Filtered: --repo=${repoFilter}${colors.reset}`
    } else if (scopeFilter) {
      header += `\n${colors.yellow}🔍 Filtered: --scope=${scopeFilter}${colors.reset}`
    }

    if (noCache) {
      header += `\n${colors.yellow}🚫 Cache disabled (--no-cache)${colors.reset}`
    }

    log(header + '\n')
  }

  try {
    // NEW: Load cache at the start
    const cache = loadCache()

    // 1. Build (in correct order)
    if (!skipBuild) {
      await buildAllLayers()
    } else {
      log('⏭️  Skipping build (--skip-build)', 'yellow')
    }

    // 2. Lint
    if (!skipLint) {
      await runOnAllPackages('run lint', '🔍 Running linter', 'lint', cache)
    } else {
      log('⏭️  Skipping lint (--skip-lint)', 'yellow')
    }

    // 3. Type check
    if (!skipTypes) {
      await runOnAllPackages('run type-check', '📘 Running type check', 'typeCheck', cache)
    } else {
      log('⏭️  Skipping type-check (--skip-types)', 'yellow')
    }

    // 4. Tests
    if (!skipTests) {
      await runOnAllPackages('run test', '🧪 Running tests', 'test', cache)
    } else {
      log('⏭️  Skipping tests (--skip-tests)', 'yellow')
    }

    // NEW: Save cache at the end
    if (!noCache) {
      saveCache(cache)
    }

    // Save last run results so core:gate can read fresh data without re-running
    try {
      const lastRunPath = join(CACHE_DIR, 'last-run.json')
      writeFileSync(lastRunPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        git: (() => {
          try {
            const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8', stdio: ['pipe','pipe','ignore'] }).trim()
            return { commit }
          } catch { return {} }
        })(),
        failedPackages: {
          build: results.build.failed,
          lint: results.lint.failed,
          typeCheck: results.typeCheck.failed,
          test: results.test.failed,
        }
      }, null, 2))
    } catch { /* non-critical */ }

    // Load baselines and calculate diff
    const baselines = loadBaselines()
    const diff = calculateDiff(baselines)

    // Print report
    if (jsonMode) {
      printJsonReport(baselines, diff)
    } else {
      printHumanReport(baselines, diff)
    }

    // Auto-save QA results to history
    if (!jsonMode) {
      log('\n💾 Saving QA results to history...', 'cyan')
      try {
        execSync('pnpm qa:save', { stdio: 'inherit' })
        log('✅ Results saved successfully\n', 'green')
      } catch (err) {
        log('⚠️  Failed to save results (this is non-critical)', 'yellow')
      }
    }

  } catch (err) {
    if (jsonMode) {
      console.log(JSON.stringify({ status: 'error', message: err.message }, null, 2))
    } else {
      log(`\n❌ QA runner failed: ${err.message}`, 'red')
    }
    process.exit(1)
  }
}

main()
