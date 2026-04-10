/**
 * @module @kb-labs/core-policy/types/types
 * Policy system types
 */

export interface Identity {
  user?: string;
  roles: string[];
}

export interface PolicyRule {
  action: string;
  resource?: string;
  allow?: string[];
  deny?: string[];
}

export interface Policy {
  $schema?: string;
  schemaVersion: "1.0";
  default?: "allow" | "deny";
  rules: PolicyRule[];
  metadata?: {
    name: string;
    version: string;
    description?: string;
  };
}

export interface PolicyResolutionOptions {
  presetBundle?: string;
  workspaceOverrides?: Policy;
}

export interface PolicyResolutionResult {
  policy: Policy;
  source: "preset" | "workspace" | "default";
  bundle?: string;
}

// Base actions for KB Labs
export const BASE_ACTIONS = {
  RELEASE_PUBLISH: "release.publish",
  DEVKIT_SYNC: "devkit.sync",
  DEVLINK_WATCH: "devlink.watch",
  AI_REVIEW_RUN: "aiReview.run",
  PROFILES_MATERIALIZE: "profiles.materialize",
} as const;

export type BaseAction = (typeof BASE_ACTIONS)[keyof typeof BASE_ACTIONS];
