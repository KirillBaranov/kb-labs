/**
 * @module @kb-labs/core-config/__tests__/product-config-profiles
 * Tests for product config with profile integration
 */

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { getProductConfig } from "../api/product-config";
import type { ProfileLayerInput } from "../types/types";

describe("Product Config with Profiles", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `kb-labs-config-profiles-${Date.now()}`);
    await fsp.mkdir(testDir, { recursive: true });
  });

  it("should merge profile overlays correctly", async () => {
    const profileLayer: ProfileLayerInput = {
      profileId: "test-profile",
      source: "profile:test-profile@1.0.0",
      products: { maxFiles: 50, debug: false },
    };

    const result = await getProductConfig(
      {
        cwd: testDir,
        product: "aiReview",
        cli: {},
        profileLayer,
      },
      null,
    );

    expect(result.config.maxFiles).toBe(50);
    expect(result.config.debug).toBe(false);
    const traceLayer = result.trace.find((t) => t.layer === "profile");
    expect(traceLayer?.source).toBe("profile:test-profile@1.0.0");
  });

  it("should handle missing profile gracefully", async () => {
    // Test without profileInfo
    const config = await getProductConfig(
      {
        cwd: testDir,
        product: "aiReview",
        cli: {},
      },
      null,
      // No profileInfo passed
    );

    expect(config.config).toBeDefined();
    expect(config.trace).toBeDefined();
  });

  it("should include profile info in trace", async () => {
    const profileLayerInput: ProfileLayerInput = {
      profileId: "test-profile",
      source: "profile:test-profile@1.2.0",
      products: { enabled: true },
    };

    const config = await getProductConfig(
      {
        cwd: testDir,
        product: "aiReview",
        cli: {},
        profileLayer: profileLayerInput,
      },
      null,
    );

    const profileLayer = config.trace.find((t) => t.layer === "profile");
    expect(profileLayer).toBeDefined();
    expect(profileLayer?.source).toBe("profile:test-profile@1.2.0");
  });

  it("should include scope layer when provided", async () => {
    const profileLayerInput: ProfileLayerInput = {
      profileId: "test-profile",
      source: "profile:test-profile@1.0.0",
      products: { engine: "openai" },
      scope: {
        id: "src",
        source: "profile-scope:src",
        products: { engine: "anthropic" },
      },
    };

    const config = await getProductConfig(
      {
        cwd: testDir,
        product: "aiReview",
        cli: {},
        profileLayer: profileLayerInput,
      },
      null,
    );

    const scopeLayer = config.trace.find((t) => t.layer === "profile-scope");
    expect(scopeLayer).toBeDefined();
    expect(scopeLayer?.source).toBe("profile-scope:src");
    expect(config.config.engine).toBe("anthropic");
  });
});
