/**
 * @module @kb-labs/core-registry/health/health-aggregator
 * System health snapshot aggregation.
 * Adapted from @kb-labs/cli-api/modules/health.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type {
  PluginBrief,
  RegistrySnapshot,
  SystemHealthSnapshot,
  SystemHealthOptions,
  GitInfo,
} from '../types.js';

export interface HealthDeps {
  getSnapshot: () => RegistrySnapshot;
  listPlugins: () => PluginBrief[];
  getManifest: (pluginId: string) => ManifestV3 | undefined;
  root: string;
  platformVersion: string;
}

export class HealthAggregator {
  private readonly deps: HealthDeps;

  constructor(deps: HealthDeps) {
    this.deps = deps;
  }

  async getSystemHealth(opts?: SystemHealthOptions): Promise<SystemHealthSnapshot> {
    const now = new Date();
    const uptimeSec = typeof opts?.uptimeSec === 'number' ? Math.max(0, Math.floor(opts.uptimeSec)) : Math.floor(process.uptime());
    const snapshot = this.deps.getSnapshot();
    const plugins = this.deps.listPlugins();
    const gitInfo = getGitInfo(this.deps.root);

    let withRest = 0;
    let withStudio = 0;

    const components = plugins.map(plugin => {
      const manifest = this.deps.getManifest(plugin.id);
      const restRoutes = manifest?.rest?.routes?.length ?? 0;
      const studioWidgets = manifest?.studio?.pages?.length ?? 0;
      if (restRoutes > 0) {withRest++;}
      if (studioWidgets > 0) {withStudio++;}
      return { id: plugin.id, version: plugin.version, restRoutes, studioWidgets };
    });

    const degraded = snapshot.partial || snapshot.stale;

    const version: SystemHealthSnapshot['version'] = {
      kbLabs: process.env.KB_LABS_VERSION || this.deps.platformVersion,
      rest: process.env.KB_REST_VERSION || 'unknown',
      studio: process.env.KB_STUDIO_VERSION,
      ...(opts?.version ?? {}),
    };
    if (!version.git && gitInfo) {version.git = gitInfo;}

    return {
      schema: 'kb.health/1',
      ts: now.toISOString(),
      uptimeSec,
      version,
      registry: {
        total: plugins.length,
        withRest,
        withStudio,
        errors: snapshot.diagnostics?.filter(d => d.severity === 'error').length ?? 0,
        generatedAt: snapshot.generatedAt,
        expiresAt: snapshot.expiresAt,
        partial: snapshot.partial,
        stale: snapshot.stale,
      },
      status: degraded ? 'degraded' : 'healthy',
      components,
      meta: opts?.meta,
    };
  }
}

// ---------------------------------------------------------------------------
// Git info (inline, no external dependency)
// ---------------------------------------------------------------------------

let cachedGitInfo: GitInfo | null | undefined;

function getGitInfo(root: string): GitInfo | undefined {
  if (cachedGitInfo !== undefined) {return cachedGitInfo ?? undefined;}

  const envSha = process.env.KB_GIT_SHA || process.env.CI_COMMIT_SHA;
  if (envSha) {
    cachedGitInfo = { sha: envSha, dirty: process.env.KB_GIT_DIRTY === 'true' };
    return cachedGitInfo;
  }

  const gitRoot = findGitRoot(root);
  if (!gitRoot) { cachedGitInfo = null; return undefined; }

  try {
    const headPath = join(gitRoot, '.git', 'HEAD');
    if (!existsSync(headPath)) { cachedGitInfo = null; return undefined; }
    const headContent = readFileSync(headPath, 'utf8').trim();
    let sha = headContent;
    if (headContent.startsWith('ref:')) {
      const refPath = join(gitRoot, '.git', headContent.replace('ref:', '').trim());
      if (existsSync(refPath)) {sha = readFileSync(refPath, 'utf8').trim();}
    }
    let dirty = false;
    try {
      const output = execSync('git status --porcelain', { cwd: gitRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      dirty = output.length > 0;
    } catch { /* git not available */ }
    cachedGitInfo = { sha, dirty };
    return cachedGitInfo;
  } catch { cachedGitInfo = null; return undefined; }
}

function findGitRoot(start: string): string | null {
  let current = resolve(start);
  let prev = '';
  while (current !== prev) {
    if (existsSync(join(current, '.git'))) {return current;}
    prev = current;
    current = dirname(current);
  }
  return null;
}

export function resetGitInfoCache(): void { cachedGitInfo = undefined; }
