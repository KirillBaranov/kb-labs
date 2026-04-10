/**
 * @module @kb-labs/core-bundle/api/load-bundle
 * Bundle orchestration logic
 */

import path from 'node:path';
import {
  getProductConfig,
  toFsProduct,
  readWorkspaceConfig,
  readProfilesSection,
  resolveProfile as resolveProfileV2,
  selectProfileScope,
  validateProductConfig,
  type BundleProfile,
  type ProfileLayerInput,
} from '@kb-labs/core-config';
import {
  resolvePolicy,
  createPermitsFunction
} from '@kb-labs/core-policy';
import { KbError, ERROR_HINTS } from '@kb-labs/core-config';
import { resolveWorkspaceRoot } from '@kb-labs/core-workspace';
import type { LoadBundleOptions, Bundle } from '../types/types';

/**
 * Load bundle with config, profile, and policy
 */
export async function loadBundle<T = any>(opts: LoadBundleOptions): Promise<Bundle<T>> {
  const {
    cwd: requestedCwd,
    product,
    profileId: explicitProfileId,
    scopeId,
    cli,
    writeFinalConfig,
    validate,
  } = opts;
  const fsProduct = toFsProduct(product);

  const workspaceResolution = await resolveWorkspaceRoot({
    cwd: requestedCwd,
    startDir: requestedCwd ?? process.cwd(),
  });
  const cwd = workspaceResolution.rootDir;
  const executionPath = requestedCwd ? path.resolve(requestedCwd) : process.cwd();

  const workspaceConfig = await readWorkspaceConfig(cwd);
  if (!workspaceConfig?.data) {
    throw new KbError(
      'ERR_CONFIG_NOT_FOUND',
      'No workspace configuration found',
      ERROR_HINTS.ERR_CONFIG_NOT_FOUND,
      { cwd }
    );
  }

  const workspaceData = workspaceConfig.data as Record<string, unknown>;

  const profilesSection = await readProfilesSection(cwd);
  const availableProfiles = profilesSection.profiles.map((p) => p.id);
  const profileId = determineProfileId(explicitProfileId, availableProfiles);
  if (!profileId && scopeId) {
    throw new KbError(
      'ERR_PROFILE_NOT_DEFINED',
      'Scope selection requires a profile. Pass --profile=<id>.',
      ERROR_HINTS.ERR_PROFILE_NOT_DEFINED,
      { available: availableProfiles }
    );
  }

  let bundleProfile: BundleProfile | null = null;
  let profileLayerInput: ProfileLayerInput | undefined;

  if (profileId) {
    bundleProfile = await resolveProfileV2({ cwd, profileId });
    const scopeSelection = selectProfileScope({
      bundleProfile,
      cwd,
      executionPath,
      scopeId,
    });
    bundleProfile.scopeSelection = scopeSelection;
    if (scopeSelection.scope) {
      bundleProfile.activeScopeId = scopeSelection.scope.id;
      bundleProfile.activeScope = scopeSelection.scope;
    }
    profileLayerInput = buildProfileLayer(bundleProfile, product);
  }

  const configResult = await getProductConfig({
    cwd,
    product,
    cli,
    writeFinal: writeFinalConfig,
    profileLayer: profileLayerInput,
  }, null);

  // Optional validation
  if (validate) {
    const result = validateProductConfig(product, configResult.config);
    if (!result.ok) {
      if (validate === 'warn') {
        // Warning: validation failed but continuing
        console.warn('[core-bundle] Config validation warnings:', result.errors);
      } else {
        const err = new Error('Config validation failed') as Error & { details: unknown };
        err.details = result.errors;
        throw err;
      }
    }
  }

  // Resolve policy
  const policyConfig = workspaceData.policy as { bundle?: string; overrides?: import('@kb-labs/core-policy').Policy } | undefined;
  const policyResult = await resolvePolicy({
    presetBundle: policyConfig?.bundle,
    workspaceOverrides: policyConfig?.overrides
  });

  // Create policy wrapper
  const policy = {
    bundle: policyResult.bundle,
    permits: createPermitsFunction(policyResult.policy, { roles: ['user'] })
  };

  return {
    product,
    config: configResult.config as unknown as T,
    profile: bundleProfile,
    policy,
    trace: configResult.trace
  };
}

function determineProfileId(explicit: string | undefined, available: string[]): string | undefined {
  if (explicit) {
    return explicit;
  }
  if (available.length === 1) {
    return available[0];
  }
  return undefined;
}

function buildProfileLayer(bundleProfile: BundleProfile, product: string): ProfileLayerInput {
  const fsProduct = toFsProduct(product);
  const profileOverlay = cloneOverlay(
    bundleProfile.products?.[product] ?? bundleProfile.products?.[fsProduct]
  );
  const layer: ProfileLayerInput = {
    profileId: bundleProfile.id,
    source: buildProfileSource(bundleProfile),
    products: profileOverlay,
  };

  if (bundleProfile.activeScopeId && bundleProfile.productsByScope) {
    const scopeProducts = bundleProfile.productsByScope[bundleProfile.activeScopeId];
    const scopeOverlay = cloneOverlay(
      scopeProducts?.[product] ?? scopeProducts?.[fsProduct]
    );
    if (scopeOverlay) {
      layer.scope = {
        id: bundleProfile.activeScopeId,
        source: `profile-scope:${bundleProfile.activeScopeId}`,
        products: scopeOverlay,
      };
    }
  }

  return layer;
}

function buildProfileSource(profile: BundleProfile): string {
  const versionPart = profile.version ? `@${profile.version}` : '';
  return `profile:${profile.id}${versionPart}`;
}

function cloneOverlay(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (typeof structuredClone === 'function') {
    return structuredClone(value) as Record<string, unknown>;
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
