/**
 * Reading a package's own KB Labs manifest out of a packed tarball.
 *
 * Migrated from `tools/kb-create/scripts/prepare-release-index.mjs`. Two rules
 * from that script are load-bearing and preserved verbatim in spirit:
 *
 * 1. The manifest is read from the *exact tarball the release will publish*, not
 *    from the source tree, so what the index describes and what a consumer
 *    installs cannot diverge.
 * 2. A manifest shipped as compiled JavaScript is *parsed*, never executed. A
 *    release must never run code out of an artifact while describing it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ServiceManifest {
  schema: 'kb.service/1';
  id: string;
  runtime?: { port?: number };
  dependsOn?: string[];
  bin?: Record<string, string>;
}

export interface AdapterManifest {
  schema: 'kb.adapter/1';
  id: string;
  implements: string | string[];
}

export interface PluginManifest {
  schema: 'kb.plugin/3';
  id?: string;
  platform?: { requires?: string[] };
}

export interface ArtifactManifestV2 {
  schema: 'kb.create.artifact-manifest/v2';
  id?: string;
  requirements?: unknown[];
}

export type PackageManifest = ServiceManifest | AdapterManifest | PluginManifest | ArtifactManifestV2;

const JSON_MANIFEST_CANDIDATES = [
  'kb-create.manifest.json',
  join('dist', 'kb-create.manifest.json'),
  join('dist', 'manifest.json'),
];

/** Extracts a tarball's `package/` root into `destination`. */
export function extractTarball(tarball: string, destination: string): void {
  if (!existsSync(tarball)) {
    throw new Error(`staged tarball is missing: ${tarball}`);
  }
  mkdirSync(destination, { recursive: true });
  const result = spawnSync('tar', ['-xzf', tarball, '-C', destination, '--strip-components=1'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`extract ${tarball}: ${result.stderr || result.stdout}`);
  }
}

/**
 * Parses declarative literals out of a compiled `dist/manifest.js`.
 *
 * Published service and adapter packages ship their manifest as JavaScript
 * rather than JSON. The release index is the installation contract, so their
 * service graph has to survive into it instead of being flattened into "just
 * another package" — but reading it must stay inert, hence regex extraction of
 * the few literal fields the index needs.
 */
function parseCompiledManifest(source: string): PackageManifest | undefined {
  if (/schema:\s*["']kb\.service\/1["']/.test(source)) {
    const id = /\bid:\s*["']([^"']+)["']/.exec(source)?.[1];
    const port = Number(/\bport:\s*(\d+)/.exec(source)?.[1] ?? 0);
    const dependsOnSource = /\bdependsOn:\s*\[([^\]]*)\]/.exec(source)?.[1];
    const dependsOn = dependsOnSource
      ? [...dependsOnSource.matchAll(/["']([^"']+)["']/g)].map(match => match[1]!)
      : [];
    if (id) { return { schema: 'kb.service/1', id, runtime: { port }, dependsOn }; }
  }

  const id = /\bid:\s*["']([^"']+)["']/.exec(source)?.[1];
  const implementsSource = /\bimplements:\s*(\[[^\]]+\]|["'][^"']+["'])/.exec(source)?.[1];
  if (id && implementsSource) {
    const implementsValue = implementsSource.startsWith('[')
      ? [...implementsSource.matchAll(/["']([^"']+)["']/g)].map(match => match[1]!)
      : implementsSource.slice(1, -1);
    return { schema: 'kb.adapter/1', id, implements: implementsValue };
  }

  return undefined;
}

/** Reads the KB Labs manifest from an already-extracted package directory. */
export function readPackageManifest(packageDir: string): PackageManifest | undefined {
  for (const candidate of JSON_MANIFEST_CANDIDATES) {
    const path = join(packageDir, candidate);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
    }
  }

  const compiled = join(packageDir, 'dist', 'manifest.js');
  if (existsSync(compiled)) {
    return parseCompiledManifest(readFileSync(compiled, 'utf8'));
  }

  return undefined;
}

export function readPackageJson(packageDir: string): Record<string, unknown> {
  const path = join(packageDir, 'package.json');
  if (!existsSync(path)) {
    throw new Error(`tarball at ${packageDir} has no package.json`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}
