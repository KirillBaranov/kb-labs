/**
 * @module @kb-labs/core-sandbox/validation/preflight
 * Pre-flight checks for sandbox execution
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { createDebugLogger } from '../debug/logger';

export interface PreflightCheck {
  name: string;
  check: () => Promise<boolean>;
  fix?: () => Promise<void>;
  errorMessage: string;
  suggestions: string[];
}

export interface PreflightResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    error?: string;
    suggestions?: string[];
  }>;
}

/**
 * Check if bootstrap file exists
 */
async function checkBootstrapFile(): Promise<boolean> {
  try {
    const packageUrl = await import.meta.resolve('@kb-labs/core-sandbox');
    const packagePath = fileURLToPath(packageUrl);
    const bootstrapPath = path.join(packagePath, 'dist', 'runner', 'bootstrap.js');
    if (existsSync(bootstrapPath)) {
      return true;
    }
    // If resolved path doesn't exist, try fallback
    throw new Error(`Resolved bootstrap path does not exist: ${bootstrapPath}`);
  } catch {
    // Fallback: try to find sandbox package by traversing up from current file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Try to find sandbox package by going up to workspace root
    let searchDir = __dirname;
    for (let i = 0; i < 10; i++) {
      // Check for workspace structure: kb-labs-core/packages/sandbox/dist/runner/bootstrap.js
      const corePath = path.join(searchDir, 'kb-labs-core', 'packages', 'sandbox', 'dist', 'runner', 'bootstrap.js');
      if (existsSync(corePath)) {
        return true;
      }
      
      // Check for node_modules/@kb-labs/core-sandbox
      const nodeModulesPath = path.join(searchDir, 'node_modules', '@kb-labs', 'sandbox', 'dist', 'runner', 'bootstrap.js');
      if (existsSync(nodeModulesPath)) {
        return true;
      }
      
      // Check if we're already in sandbox/dist
      if (searchDir.endsWith('/sandbox/dist') || searchDir.endsWith('\\sandbox\\dist')) {
        const fallbackPath = path.join(searchDir, 'runner', 'bootstrap.js');
        if (existsSync(fallbackPath)) {
          return true;
        }
      }
      
      const parentDir = path.dirname(searchDir);
      if (parentDir === searchDir) {break;}
      searchDir = parentDir;
    }
    
    // Last resort: relative path from validation/ to dist/runner/bootstrap.js
    const fallbackPath = path.join(__dirname, '..', '..', 'dist', 'runner', 'bootstrap.js');
    return existsSync(fallbackPath);
  }
}

/**
 * Check if source maps exist
 */
async function checkSourceMaps(): Promise<boolean> {
  try {
    const packageUrl = await import.meta.resolve('@kb-labs/core-sandbox');
    const packagePath = fileURLToPath(packageUrl);
    const sourceMapPath = path.join(packagePath, 'dist', 'runner', 'bootstrap.js.map');
    return existsSync(sourceMapPath);
  } catch {
    return false;
  }
}

/**
 * Check Node.js version
 */
function checkNodeVersion(): boolean {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0] || '0', 10);
  return major >= 18; // ESM support requires Node 18+
}

/**
 * Check if required dependencies are installed
 */
async function checkDependencies(): Promise<boolean> {
  try {
    // Check if package can be resolved (avoid circular import by checking resolution only)
    await import.meta.resolve('@kb-labs/core-sandbox');
    // Also check if shared-cli-ui is available (for debug formatters)
    try {
      await import.meta.resolve('@kb-labs/shared-cli-ui');
      return true;
    } catch {
      // shared-cli-ui is optional for now, but recommended
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Check if build artifacts are up-to-date
 */
async function checkBuildArtifacts(): Promise<boolean> {
  try {
    const packageUrl = await import.meta.resolve('@kb-labs/core-sandbox');
    const packagePath = fileURLToPath(packageUrl);
    const bootstrapPath = path.join(packagePath, 'dist', 'runner', 'bootstrap.js');
    const sourcePath = path.join(packagePath, 'src', 'runner', 'bootstrap.ts');
    
    if (!existsSync(bootstrapPath) || !existsSync(sourcePath)) {
      return false;
    }
    
    const { stat } = await import('node:fs/promises');
    const bootstrapStats = await stat(bootstrapPath);
    const sourceStats = await stat(sourcePath);
    
    // Build should be newer than source
    return bootstrapStats.mtime >= sourceStats.mtime;
  } catch {
    return false;
  }
}

/**
 * Run all pre-flight checks
 */
export async function runPreflightChecks(debug: boolean = false): Promise<PreflightResult> {
  const logger = createDebugLogger(debug, 'sandbox:preflight', {
    format: 'human',
    detailLevel: 'verbose',
  });
  
  const checks: PreflightCheck[] = [
    {
      name: 'Bootstrap file exists',
      check: checkBootstrapFile,
      errorMessage: 'Bootstrap file not found',
      suggestions: [
        'Run `pnpm build` in kb-labs-core/packages/sandbox',
        'Check that @kb-labs/core-sandbox package is properly installed',
      ],
    },
    {
      name: 'Source maps available',
      check: checkSourceMaps,
      errorMessage: 'Source maps not found',
      suggestions: [
        'Run `pnpm build` in kb-labs-core/packages/sandbox',
        'Source maps are required for debugging',
      ],
    },
    {
      name: 'Node.js version',
      check: async () => checkNodeVersion(),
      errorMessage: 'Node.js version too old',
      suggestions: [
        `Current version: ${process.version}`,
        'Requires Node.js 18+ for ESM support',
        'Update Node.js: https://nodejs.org/',
      ],
    },
    {
      name: 'Dependencies installed',
      check: checkDependencies,
      errorMessage: 'Required dependencies missing',
      suggestions: [
        'Run `pnpm install` in the monorepo root',
        'Check that @kb-labs/core-sandbox is properly linked',
      ],
    },
    {
      name: 'Build artifacts up-to-date',
      check: checkBuildArtifacts,
      errorMessage: 'Build artifacts are outdated',
      suggestions: [
        'Run `pnpm build` in kb-labs-core/packages/sandbox',
        'Source files are newer than build artifacts',
      ],
    },
  ];
  
  const results = await Promise.all(
    checks.map(async (check) => {
      logger.debug('Running check', { name: check.name });
      try {
        const passed = await check.check();
        return {
          name: check.name,
          passed,
          error: passed ? undefined : check.errorMessage,
          suggestions: passed ? undefined : check.suggestions,
        };
      } catch (error) {
        logger.error('Check failed with error', { name: check.name, error });
        return {
          name: check.name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          suggestions: check.suggestions,
        };
      }
    })
  );
  
  const passed = results.every(r => r.passed);
  
  return {
    passed,
    checks: results,
  };
}


