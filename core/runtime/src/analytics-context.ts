/**
 * @module @kb-labs/core-runtime/analytics-context
 * Auto-detection of analytics context (source, actor, runId) for event enrichment.
 *
 * See ADR-0040: Analytics V1 Auto-Enrichment
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { AnalyticsContext } from '@kb-labs/core-platform/adapters';
export type { AnalyticsContext };

/**
 * Create AnalyticsContext with auto-detection of source, actor, and runId.
 *
 * Detection logic:
 * - **Source**: Reads package.json from cwd for product name and version
 * - **Actor**: Detects from CI environment variables or git config
 *   - CI mode: Checks CI=true, GITHUB_ACTIONS, GITLAB_CI, etc.
 *   - User mode: Executes `git config user.name` and `git config user.email`
 * - **RunId**: Generates unique UUID per execution (correlates events in single CLI invocation)
 * - **Context**: Adds workspace path, git branch (if available)
 *
 * @param cwd - Workspace root directory
 * @returns AnalyticsContext with auto-populated metadata
 *
 * @example
 * ```typescript
 * const context = await createAnalyticsContext('/path/to/workspace');
 * // {
 * //   source: { product: '@kb-labs/cli', version: '1.0.0' },
 * //   runId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
 * //   actor: { type: 'user', id: 'user@example.com', name: 'John Doe' },
 * //   ctx: { workspace: '/path/to/workspace', branch: 'main' }
 * // }
 * ```
 */
export async function createAnalyticsContext(cwd: string): Promise<AnalyticsContext> {
  // 1. Detect source from package.json
  const source = await detectSource(cwd);

  // 2. Detect actor from environment
  const actor = detectActor();

  // 3. Generate runId per execution
  const runId = randomUUID();

  // 4. Additional context
  const ctx = buildContext(cwd);

  return {
    source,
    runId,
    actor,
    ctx,
  };
}

/**
 * Detect source (product name and version) from package.json
 */
async function detectSource(cwd: string): Promise<{ product: string; version: string }> {
  try {
    const pkgPath = join(cwd, 'package.json');
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    return {
      product: pkg.name || 'kb-labs',
      version: pkg.version || '0.0.0',
    };
  } catch {
    // If package.json doesn't exist or is invalid, use defaults
    return {
      product: 'kb-labs',
      version: '0.0.0',
    };
  }
}

/**
 * Detect actor from environment (CI or user)
 */
function detectActor(): AnalyticsContext['actor'] {
  // CI detection (GitHub Actions, GitLab CI, CircleCI, Jenkins, etc.)
  const isCI =
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITLAB_CI === 'true' ||
    process.env.CIRCLECI === 'true' ||
    process.env.JENKINS_URL !== undefined ||
    process.env.TRAVIS === 'true';

  if (isCI) {
    return {
      type: 'ci',
      id:
        process.env.GITHUB_ACTOR ||
        process.env.GITLAB_USER_LOGIN ||
        process.env.CIRCLE_USERNAME ||
        process.env.BUILD_USER_ID ||
        'ci-bot',
      name:
        process.env.GITHUB_ACTOR ||
        process.env.GITLAB_USER_NAME ||
        process.env.BUILD_USER ||
        'CI Bot',
    };
  }

  // User detection from git config
  try {
    const gitUser = execSync('git config user.name', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    const gitEmail = execSync('git config user.email', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return {
      type: 'user',
      id: gitEmail || undefined,
      name: gitUser || undefined,
    };
  } catch {
    // Git config not available, use minimal actor
    return {
      type: 'user',
    };
  }
}

/**
 * Build additional context (workspace, branch, etc.)
 */
function buildContext(cwd: string): Record<string, string | number | boolean | null> {
  const ctx: Record<string, string | number | boolean | null> = {
    workspace: cwd,
  };

  // Add git branch if available
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    ctx.branch = branch;
  } catch {
    // Git not available, skip branch
  }

  return ctx;
}
