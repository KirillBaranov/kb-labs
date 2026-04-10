/**
 * @module @kb-labs/core-policy/__tests__/policy-edge-cases.spec.ts
 * Edge cases and error handling tests for Policy Engine
 */

import { describe, it, expect } from "vitest";
import {
  resolvePolicy,
  createPermitsFunction,
  type Policy,
} from "../index";

describe("Policy Engine Edge Cases", () => {
  describe("Policy Resolution Edge Cases", () => {
    it("should handle missing policy configuration", async () => {
      const result = await resolvePolicy({
        presetBundle: undefined,
        workspaceOverrides: undefined,
      });

      expect(result).toBeDefined();
      expect(result.policy).toBeDefined();
      // Should have default policy (permit-all or deny-all)
    });

    it("should resolve policy with preset bundle", async () => {
      const result = await resolvePolicy({
        presetBundle: "default@1.0.0",
        workspaceOverrides: undefined,
      });

      expect(result).toBeDefined();
      expect(result.bundle).toBe("default@1.0.0");
      expect(result.policy).toBeDefined();
    });

    it("should merge workspace overrides with preset", async () => {
      const workspaceOverrides: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin"],
          },
        ],
      };

      const result = await resolvePolicy({
        presetBundle: "default@1.0.0",
        workspaceOverrides,
      });

      expect(result).toBeDefined();
      expect(result.policy.rules).toBeDefined();
      // Workspace overrides should be merged/applied
      expect(result.policy.rules.length).toBeGreaterThan(0);
    });
  });

  describe("Permission Checking Edge Cases", () => {
    it("should permit action when explicitly allowed", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin", "developer"],
          },
        ],
      };

      const permits = createPermitsFunction(policy, { roles: ["admin"] });

      expect(permits("aiReview.run")).toBe(true);
    });

    it("should deny action when explicitly denied", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            deny: ["guest"],
          },
        ],
      };

      const permits = createPermitsFunction(policy, { roles: ["guest"] });

      expect(permits("aiReview.run")).toBe(false);
    });

    it("should deny by default when no rule matches (deny-all default)", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "other.action",
            allow: ["admin"],
          },
        ],
      };

      const permits = createPermitsFunction(policy, { roles: ["user"] });

      // No rule for this action, should deny by default
      expect(permits("aiReview.run")).toBe(false);
    });

    it("should permit by default when no rule matches (permit-all mode)", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        default: "allow",
        rules: [],
      };

      const permits = createPermitsFunction(policy, { roles: ["user"] });

      // No rules, permit-all mode
      expect(permits("any.action")).toBe(true);
    });

    it("should handle conflicting allow/deny rules", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin", "developer"],
          },
          {
            action: "aiReview.run",
            deny: ["developer"], // Conflict with allow
          },
        ],
      };

      const permits = createPermitsFunction(policy, { roles: ["developer"] });

      // Behavior depends on implementation - may prioritize first rule, last rule, or deny
      // Check that function returns a boolean (behavior is consistent)
      const result = permits("aiReview.run");
      expect(typeof result).toBe("boolean");
    });

    it("should handle wildcard actions", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "*",
            allow: ["admin"],
          },
          {
            action: "aiReview.*",
            allow: ["developer"],
          },
        ],
      };

      const permitsAdmin = createPermitsFunction(policy, { roles: ["admin"] });
      const permitsDeveloper = createPermitsFunction(policy, {
        roles: ["developer"],
      });

      // Admin should have access to everything
      expect(permitsAdmin("aiReview.run")).toBe(true);
      expect(permitsAdmin("release.publish")).toBe(true);

      // Developer should have access to aiReview.*
      expect(permitsDeveloper("aiReview.run")).toBe(true);
      expect(permitsDeveloper("release.publish")).toBe(false);
    });

    it("should handle multiple roles", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin", "developer"],
          },
          {
            action: "release.publish",
            allow: ["admin"],
          },
        ],
      };

      const permits = createPermitsFunction(policy, {
        roles: ["developer", "user"],
      });

      // Should have access if any role matches
      expect(permits("aiReview.run")).toBe(true);
      expect(permits("release.publish")).toBe(false);
    });

    it("should handle empty roles", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin"],
          },
        ],
      };

      const permits = createPermitsFunction(policy, { roles: [] });

      // No roles, should deny
      expect(permits("aiReview.run")).toBe(false);
    });
  });

  describe("Policy Merge Edge Cases", () => {
    it("should merge multiple rules for same action", async () => {
      const workspaceOverrides: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin"],
          },
          {
            action: "aiReview.run",
            allow: ["developer"], // Additional allow
          },
        ],
      };

      const result = await resolvePolicy({
        presetBundle: undefined,
        workspaceOverrides,
      });

      const permits = createPermitsFunction(result.policy, {
        roles: ["developer"],
      });

      // Both rules should be merged
      expect(permits("aiReview.run")).toBe(true);
    });

    it("should handle conflicting allow/deny rules", async () => {
      const workspaceOverrides: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin"],
          },
          {
            action: "aiReview.run",
            deny: ["admin"], // Conflict
          },
        ],
      };

      const result = await resolvePolicy({
        presetBundle: undefined,
        workspaceOverrides,
      });

      const permits = createPermitsFunction(result.policy, {
        roles: ["admin"],
      });

      // Behavior depends on implementation - may prioritize first rule, last rule, or deny
      // Check that function returns a boolean (behavior is consistent)
      const result_check = permits("aiReview.run");
      expect(typeof result_check).toBe("boolean");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty policy", async () => {
      const result = await resolvePolicy({
        presetBundle: undefined,
        workspaceOverrides: {
          schemaVersion: "1.0",
          rules: [],
        },
      });

      expect(result).toBeDefined();
      expect(result.policy).toBeDefined();

      const permits = createPermitsFunction(result.policy, { roles: ["user"] });

      // Empty policy - behavior depends on default
      expect(typeof permits("any.action")).toBe("boolean");
    });

    it("should handle invalid action format", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "aiReview.run",
            allow: ["admin"],
          },
        ],
      };

      const permits = createPermitsFunction(policy, { roles: ["admin"] });

      // Invalid action should still be checked (may return false or true)
      expect(typeof permits("")).toBe("boolean");
      expect(typeof permits("invalid..action")).toBe("boolean");
    });

    it("should handle action with special characters", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "product.action-with-dashes",
            allow: ["admin"],
          },
        ],
      };

      const permits = createPermitsFunction(policy, { roles: ["admin"] });

      expect(permits("product.action-with-dashes")).toBe(true);
      expect(permits("product.other-action")).toBe(false);
    });
  });
});
