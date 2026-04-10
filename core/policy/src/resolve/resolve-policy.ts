/**
 * @module @kb-labs/core-policy/resolve/resolve-policy
 * Policy resolution with preset and workspace overrides
 */

import type {
  Policy,
  PolicyResolutionOptions,
  PolicyResolutionResult,
} from "../types/types";
import { KbError } from "@kb-labs/core-config";

/**
 * Default permit-all policy
 */
const DEFAULT_POLICY: Policy = {
  schemaVersion: "1.0",
  rules: [
    {
      action: "*",
      allow: ["*"],
    },
  ],
};

/**
 * Resolve policy from preset bundle and workspace overrides
 */
export async function resolvePolicy(
  options: PolicyResolutionOptions,
): Promise<PolicyResolutionResult> {
  const { presetBundle, workspaceOverrides } = options;

  // If no policy is configured, use permit-all default
  if (!presetBundle && !workspaceOverrides) {
    return {
      policy: DEFAULT_POLICY,
      source: "default",
    };
  }

  // If only workspace overrides are provided, use them
  if (!presetBundle && workspaceOverrides) {
    return {
      policy: workspaceOverrides,
      source: "workspace",
    };
  }

  // If preset bundle is provided, resolve it
  if (presetBundle) {
    try {
      const presetPolicy = await loadPresetPolicy(presetBundle);

      // Merge with workspace overrides if provided
      if (workspaceOverrides) {
        const mergedPolicy = mergePolicies(presetPolicy, workspaceOverrides);
        return {
          policy: mergedPolicy,
          source: "workspace",
          bundle: presetBundle,
        };
      }

      return {
        policy: presetPolicy,
        source: "preset",
        bundle: presetBundle,
      };
    } catch (error) {
      throw new KbError(
        "ERR_POLICY_RESOLVE_FAILED",
        `Failed to resolve policy bundle: ${presetBundle}`,
        "Check if the policy bundle is installed or use workspace overrides",
        {
          presetBundle,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  // Fallback to default
  return {
    policy: DEFAULT_POLICY,
    source: "default",
  };
}

/**
 * Load preset policy (placeholder for npm package resolution)
 */
async function loadPresetPolicy(bundle: string): Promise<Policy> {
  // This would be implemented with actual npm package resolution
  // For now, return a sample policy
  return {
    $schema: "https://schemas.kb-labs.dev/policy.schema.json",
    schemaVersion: "1.0",
    rules: [
      {
        action: "release.publish",
        allow: ["admin", "maintainer"],
      },
      {
        action: "devkit.sync",
        allow: ["admin", "developer"],
      },
      {
        action: "devlink.watch",
        allow: ["admin", "developer"],
      },
      {
        action: "aiReview.run",
        allow: ["admin", "reviewer"],
      },
      {
        action: "profiles.materialize",
        allow: ["admin", "developer"],
      },
    ],
    metadata: {
      name: bundle,
      version: "1.0.0",
      description: "Default KB Labs policy bundle",
    },
  };
}

/**
 * Merge policies with workspace overrides taking precedence
 */
function mergePolicies(preset: Policy, workspace: Policy): Policy {
  return {
    $schema: workspace.$schema || preset.$schema,
    schemaVersion: "1.0",
    rules: [
      ...preset.rules,
      ...workspace.rules, // Workspace rules override preset rules
    ],
    metadata: {
      name:
        workspace.metadata?.name || preset.metadata?.name || "merged-policy",
      version:
        workspace.metadata?.version || preset.metadata?.version || "1.0.0",
      description:
        workspace.metadata?.description || preset.metadata?.description,
    },
  };
}

/**
 * Validate policy schema
 */
export function validatePolicy(policy: any): policy is Policy {
  if (!policy || typeof policy !== "object") {
    return false;
  }

  if (policy.schemaVersion !== "1.0") {
    return false;
  }

  if (!Array.isArray(policy.rules)) {
    return false;
  }

  for (const rule of policy.rules) {
    if (!rule.action || typeof rule.action !== "string") {
      return false;
    }
  }

  return true;
}
