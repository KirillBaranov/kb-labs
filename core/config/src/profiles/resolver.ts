/**
 * @module @kb-labs/core-config/profiles/resolver
 * Resolve ProfileV2 definitions with extends/merge semantics.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { promises as fsp } from 'node:fs';
import type {
  BundleProfile,
  BundleProfileSource,
  ProfileTrace,
  ProfileV2,
  ScopeV2} from './types';
import {
  ProfilesV2Schema
} from './types';
import { readProfilesSection } from './loader';
import { readConfigFile } from '../api/read-config';
import { KbError, ERROR_HINTS } from '../errors/kb-error';

const requireFromHere = createRequire(import.meta.url);

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

interface ProfileLayer {
  profile: ProfileV2;
  source: BundleProfileSource | string; // Can be 'workspace' | 'preset' | 'npm' | 'implicit' or 'npm:package#profile'
  sourcePath?: string;
}

export interface ResolveProfileOptions {
  cwd: string;
  profileId: string;
}

export async function resolveProfile(
  opts: ResolveProfileOptions
): Promise<BundleProfile> {
  const localProfilesResult = await readProfilesSection(opts.cwd);
  const localProfiles = localProfilesResult.profiles;
  const localPath = localProfilesResult.sourcePath;
  const profileMap = new Map(localProfiles.map((p) => [p.id, p]));

  const cache = new Map<string, ProfileLayer>();
  if (localPath) {
    for (const profile of localProfiles) {
      cache.set(profile.id, {
        profile: clone(profile),
        source: 'workspace',
        sourcePath: localPath,
      });
    }
  }

  const chain = await resolveProfileChain(
    opts.profileId,
    cache,
    profileMap,
    opts.cwd,
    new Set<string>()
  );

  if (chain.length === 0) {
    throw new KbError(
      'ERR_PROFILE_NOT_DEFINED',
      `Profile "${opts.profileId}" not found`,
      ERROR_HINTS.ERR_PROFILE_NOT_DEFINED,
      {
        profileId: opts.profileId,
        available: Array.from(profileMap.keys()),
      }
    );
  }

  const bundleProfile = mergeProfileChain(chain);

  const productsByScope = buildScopeProductMap(bundleProfile, chain);
  bundleProfile.productsByScope = productsByScope;

  return bundleProfile;
}

async function resolveProfileChain(
  reference: string,
  cache: Map<string, ProfileLayer>,
  localProfiles: Map<string, ProfileV2>,
  cwd: string,
  seen: Set<string>
): Promise<ProfileLayer[]> {
  const key = reference;
  if (seen.has(key)) {
    throw new KbError(
      'ERR_PROFILE_EXTENDS_FAILED',
      `Circular profile extends detected at "${reference}"`,
      ERROR_HINTS.ERR_PROFILE_EXTENDS_FAILED,
      { reference, chain: Array.from(seen) }
    );
  }
  seen.add(key);

  let layer = cache.get(reference);

  if (!layer) {
    if (localProfiles.has(reference)) {
      layer = {
        profile: clone(localProfiles.get(reference)!),
        source: 'workspace',
      };
    } else if (isPackageReference(reference)) {
      layer = await loadPackageProfile(reference, cwd);
    } else {
      throw new KbError(
        'ERR_PROFILE_NOT_DEFINED',
        `Profile "${reference}" not found`,
        ERROR_HINTS.ERR_PROFILE_NOT_DEFINED,
        { reference, available: Array.from(localProfiles.keys()) }
      );
    }
    cache.set(reference, layer);
  }

  const result: ProfileLayer[] = [];
  if (layer.profile.extends) {
    const parentChain = await resolveProfileChain(
      layer.profile.extends,
      cache,
      localProfiles,
      cwd,
      seen
    );
    result.push(...parentChain);
  }

  result.push(layer);
  seen.delete(key);
  return result;
}

function mergeProfileChain(chain: ProfileLayer[]): BundleProfile {
  const mergedProducts: Record<string, Record<string, unknown>> = {};
  let mergedMeta: Record<string, unknown> | undefined;
  let mergedLabel: string | undefined;
  let mergedDescription: string | undefined;
  let mergedVersion: string | undefined;
  let scopes: ScopeV2[] = [];
  let scopesDefined = false;

  for (const layer of chain) {
    const profile = layer.profile;
    mergedLabel = profile.label ?? mergedLabel;
    mergedDescription = profile.description ?? mergedDescription;
    mergedVersion = profile.meta?.version ?? mergedVersion;
    mergedMeta = mergeMeta(mergedMeta, profile.meta);

    if (profile.products) {
      for (const [productKey, overrides] of Object.entries(profile.products)) {
        if (!matchedProductOverrides(overrides)) {
          continue;
        }
        const target = (mergedProducts[productKey] ??= {});
        Object.assign(target, clone(overrides));
      }
    }

    if (profile.scopes && profile.scopes.length > 0) {
      scopes = clone(profile.scopes);
      scopesDefined = true;
    } else if (!scopesDefined && profile.scopes) {
      scopes = clone(profile.scopes);
    }
  }

  const finalLayer = chain[chain.length - 1];
  if (!finalLayer) {
    throw new KbError(
      'ERR_PROFILE_NOT_DEFINED',
      'Profile chain is empty',
      ERROR_HINTS.ERR_PROFILE_NOT_DEFINED
    );
  }
  
  const finalId = finalLayer.profile.id;
  const finalSource = finalLayer.source;
  
  const bundleProfile: BundleProfile = {
    id: finalId,
    key: finalId,
    label: mergedLabel,
    name: mergedLabel ?? finalId,
    version: mergedVersion,
    source: finalSource as BundleProfileSource,
    scopes: scopes.map((scope) => ({
      id: scope.id,
      label: scope.label,
      description: scope.description,
      include: scope.include,
      exclude: scope.exclude,
      isDefault: !!scope.default,
      products: scope.products ? clone(scope.products) : undefined,
    })),
    products: Object.keys(mergedProducts).length ? mergedProducts : undefined,
    trace: buildTrace(chain),
    meta: mergedMeta,
    productsByScope: {},
  };

  return bundleProfile;
}

function buildScopeProductMap(
  bundleProfile: BundleProfile,
  chain: ProfileLayer[]
): Record<string, Record<string, Record<string, unknown>>> {
  const map: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const scope of bundleProfile.scopes) {
    map[scope.id] = {};
    for (const layer of chain) {
      const matchingScope = layer.profile.scopes?.find((s) => s.id === scope.id);
      if (!matchingScope?.products) {
        continue;
      }
      for (const [productKey, overrides] of Object.entries(matchingScope.products)) {
        if (!matchedProductOverrides(overrides)) {
          continue;
        }
        const scopeMap = map[scope.id];
        if (!scopeMap) {continue;}
        
        const target = scopeMap[productKey];
        if (!target) {
          scopeMap[productKey] = clone(overrides);
        } else {
          Object.assign(target, clone(overrides));
        }
      }
    }
  }

  return map;
}

function matchedProductOverrides(
  overrides: unknown
): overrides is Record<string, unknown> {
  return overrides !== null && typeof overrides === 'object';
}

function buildTrace(chain: ProfileLayer[]): ProfileTrace | undefined {
  if (chain.length <= 1) {
    return undefined;
  }

  const extendsList = chain
    .slice(0, -1)
    .map((layer) => {
      // For npm packages, source is already in format "npm:package#profile"
      if (typeof layer.source === 'string' && layer.source.startsWith('npm:')) {
        return layer.source;
      }
      // For workspace profiles, use source:profileId format
      return `${layer.source}:${layer.profile.id}`;
    });

  return {
    extends: extendsList,
  };
}

function mergeMeta(
  existing: Record<string, unknown> | undefined,
  next?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!next) {
    return existing ? structuredClone(existing) : undefined;
  }
  if (!existing) {
    return structuredClone(next);
  }
    return { ...existing, ...clone(next) };
}

function isPackageReference(ref: string): boolean {
  return ref.includes('/') || ref.startsWith('@');
}

interface PackageProfileRef {
  packageName: string;
  profileId: string;
}

function parsePackageReference(ref: string): PackageProfileRef {
  const [pkg, profileId] = ref.split('#');
  return {
    packageName: pkg || '',
    profileId: profileId || 'default',
  };
}

async function loadPackageProfile(
  ref: string,
  cwd: string
): Promise<ProfileLayer> {
  const { packageName, profileId } = parsePackageReference(ref);

  let pkgJsonPath: string;
  try {
    pkgJsonPath = requireFromHere.resolve(`${packageName}/package.json`, {
      paths: [cwd],
    });
  } catch {
    throw new KbError(
      'ERR_PROFILE_EXTENDS_FAILED',
      `Cannot resolve package "${packageName}" for profile extends`,
      ERROR_HINTS.ERR_PROFILE_EXTENDS_FAILED,
      { reference: ref }
    );
  }

  const pkgDir = path.dirname(pkgJsonPath);
  const candidateConfigs = [
    'kb.config.json',
    'kb.config.yaml',
    'kb.config.yml',
    path.join('config', 'kb.config.json'),
    path.join('config', 'kb.config.yaml'),
    path.join('config', 'kb.config.yml'),
  ];

  for (const candidate of candidateConfigs) {
    const fullPath = path.join(pkgDir, candidate);
    try {
      await fsp.access(fullPath);
    } catch {
      continue;
    }

    const config = await readConfigFile(fullPath);
    const profiles = (config.data as any)?.profiles;
    const parsed = ProfilesV2Schema.safeParse(profiles);
    if (!parsed.success) {
      continue;
    }
    const target = parsed.data.find((p) => p.id === profileId);
    if (!target) {
      continue;
    }
    return {
      profile: clone(target),
      source: `npm:${packageName}#${profileId}`,
      sourcePath: fullPath,
    };
  }

  throw new KbError(
    'ERR_PROFILE_EXTENDS_FAILED',
    `Profile "${profileId}" not found in package "${packageName}"`,
    ERROR_HINTS.ERR_PROFILE_EXTENDS_FAILED,
    { reference: ref }
  );
}

