/**
 * @module @kb-labs/core-policy/__tests__/policy.spec.ts
 * Tests for policy system
 */

import { describe, it, expect } from "vitest";
import { resolvePolicy, validatePolicy } from "../resolve/resolve-policy";
import { can, createPermitsFunction, requirePermission } from "../check/can";
import { validatePolicySchema } from "../schema/policy-schema";
import type { Policy, Identity } from "../types/types";
import { BASE_ACTIONS } from "../types/types";
import { KbError } from "@kb-labs/core-config";

describe("Policy System", () => {
  describe("Policy Resolution", () => {
    it("should use permit-all default when no policy configured", async () => {
      const result = await resolvePolicy({});

      expect(result.source).toBe("default");
      expect(result.policy.rules).toHaveLength(1);
      const firstRule = result.policy.rules[0]!;
      expect(firstRule.action).toBe("*");
      expect(firstRule.allow).toEqual(["*"]);
    });

    it("should use workspace overrides when provided", async () => {
      const workspacePolicy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "release.publish",
            allow: ["admin"],
          },
        ],
      };

      const result = await resolvePolicy({
        workspaceOverrides: workspacePolicy,
      });

      expect(result.source).toBe("workspace");
      expect(result.policy).toEqual(workspacePolicy);
    });

    it("should merge preset and workspace policies", async () => {
      const workspacePolicy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "release.publish",
            allow: ["admin", "maintainer"],
          },
        ],
      };

      const result = await resolvePolicy({
        presetBundle: "default@1.0.0",
        workspaceOverrides: workspacePolicy,
      });

      expect(result.source).toBe("workspace");
      expect(result.bundle).toBe("default@1.0.0");
      expect(result.policy.rules.length).toBeGreaterThan(1);
    });
  });

  describe("Permission Checking", () => {
    const policy: Policy = {
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
          action: "aiReview.run",
          allow: ["admin", "reviewer"],
        },
        {
          action: "profiles.materialize",
          allow: ["admin", "developer"],
        },
      ],
    };

    it("should allow admin to perform any action", () => {
      const identity: Identity = { roles: ["admin"] };

      expect(can(policy, identity, BASE_ACTIONS.RELEASE_PUBLISH)).toBe(true);
      expect(can(policy, identity, BASE_ACTIONS.DEVKIT_SYNC)).toBe(true);
      expect(can(policy, identity, BASE_ACTIONS.AI_REVIEW_RUN)).toBe(true);
      expect(can(policy, identity, BASE_ACTIONS.PROFILES_MATERIALIZE)).toBe(
        true,
      );
    });

    it("should allow maintainer to publish releases", () => {
      const identity: Identity = { roles: ["maintainer"] };

      expect(can(policy, identity, BASE_ACTIONS.RELEASE_PUBLISH)).toBe(true);
      expect(can(policy, identity, BASE_ACTIONS.DEVKIT_SYNC)).toBe(false);
    });

    it("should allow developer to sync devkit and materialize profiles", () => {
      const identity: Identity = { roles: ["developer"] };

      expect(can(policy, identity, BASE_ACTIONS.DEVKIT_SYNC)).toBe(true);
      expect(can(policy, identity, BASE_ACTIONS.PROFILES_MATERIALIZE)).toBe(
        true,
      );
      expect(can(policy, identity, BASE_ACTIONS.RELEASE_PUBLISH)).toBe(false);
    });

    it("should allow reviewer to run AI review", () => {
      const identity: Identity = { roles: ["reviewer"] };

      expect(can(policy, identity, BASE_ACTIONS.AI_REVIEW_RUN)).toBe(true);
      expect(can(policy, identity, BASE_ACTIONS.RELEASE_PUBLISH)).toBe(false);
    });

    it("should deny unknown roles", () => {
      const identity: Identity = { roles: ["guest"] };

      expect(can(policy, identity, BASE_ACTIONS.RELEASE_PUBLISH)).toBe(false);
      expect(can(policy, identity, BASE_ACTIONS.DEVKIT_SYNC)).toBe(false);
    });

    it("should permit all when no policy rules", () => {
      const emptyPolicy: Policy = {
        schemaVersion: "1.0",
        rules: [],
      };
      const identity: Identity = { roles: ["guest"] };

      expect(can(emptyPolicy, identity, BASE_ACTIONS.RELEASE_PUBLISH)).toBe(
        true,
      );
    });
  });

  describe("Permits Function", () => {
    it("should create permits function for specific identity", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "release.publish",
            allow: ["admin"],
          },
        ],
      };

      const adminIdentity: Identity = { roles: ["admin"] };
      const guestIdentity: Identity = { roles: ["guest"] };

      const adminPermits = createPermitsFunction(policy, adminIdentity);
      const guestPermits = createPermitsFunction(policy, guestIdentity);

      expect(adminPermits(BASE_ACTIONS.RELEASE_PUBLISH)).toBe(true);
      expect(guestPermits(BASE_ACTIONS.RELEASE_PUBLISH)).toBe(false);
    });
  });

  describe("Permission Requirements", () => {
    it("should throw error when permission denied", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "release.publish",
            allow: ["admin"],
          },
        ],
      };

      const identity: Identity = { roles: ["guest"] };

      expect(() => {
        requirePermission(policy, identity, BASE_ACTIONS.RELEASE_PUBLISH);
      }).toThrow(KbError);
    });

    it("should not throw when permission granted", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "release.publish",
            allow: ["admin"],
          },
        ],
      };

      const identity: Identity = { roles: ["admin"] };

      expect(() => {
        requirePermission(policy, identity, BASE_ACTIONS.RELEASE_PUBLISH);
      }).not.toThrow();
    });
  });

  describe("Schema Validation", () => {
    it("should validate correct policy schema", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "release.publish",
            allow: ["admin"],
          },
        ],
      };

      const result = validatePolicySchema(policy);
      expect(result.valid).toBe(true);
    });

    it("should reject invalid policy schema", () => {
      const invalidPolicy = {
        schemaVersion: "2.0", // Wrong version
        rules: "not-an-array", // Wrong type
      };

      const result = validatePolicySchema(invalidPolicy);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe("Policy Validation", () => {
    it("should validate correct policy structure", () => {
      const policy: Policy = {
        schemaVersion: "1.0",
        rules: [
          {
            action: "release.publish",
            allow: ["admin"],
          },
        ],
      };

      expect(validatePolicy(policy)).toBe(true);
    });

    it("should reject invalid policy structure", () => {
      const invalidPolicy = {
        schemaVersion: "2.0",
        rules: [],
      };

      expect(validatePolicy(invalidPolicy)).toBe(false);
    });
  });
});
