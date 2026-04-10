import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { resolveProfile } from "../profiles/resolver";
import { KbError } from "../errors/kb-error";

const writeJson = (filePath: string, data: unknown) =>
  fs.writeFile(filePath, JSON.stringify(data, null, 2));

describe("resolveProfile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `kb-profiles-${Date.now()}-${Math.random()}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves local profile with extends chain and merges overlays", async () => {
    await writeJson(path.join(tmpDir, "kb.config.json"), {
      profiles: [
        {
          id: "base",
          label: "Base Profile",
          products: {
            aiReview: { engine: "openai", maxComments: 20 },
          },
          scopes: [
            {
              id: "root",
              include: ["**/*"],
              default: true,
              products: { aiReview: { engine: "openai" } },
            },
          ],
        },
        {
          id: "child",
          extends: "base",
          products: {
            aiReview: { engine: "anthropic" },
          },
          scopes: [
            {
              id: "src",
              include: ["src/**"],
              default: true,
              products: { aiReview: { engine: "anthropic" } },
            },
          ],
        },
      ],
    });

    const result = await resolveProfile({ cwd: tmpDir, profileId: "child" });

    expect(result.id).toBe("child");
    expect(result.products?.aiReview).toEqual({
      engine: "anthropic",
      maxComments: 20,
    });
    expect(result.scopes).toHaveLength(1);
    expect(result.scopes[0]!.products?.aiReview).toEqual({
      engine: "anthropic",
    });
    expect(result.productsByScope?.src?.aiReview).toEqual({
      engine: "anthropic",
    });
    expect(result.trace?.extends).toEqual(["workspace:base"]);
  });

  it("throws when profile not found", async () => {
    await writeJson(path.join(tmpDir, "kb.config.json"), { profiles: [] });

    await expect(
      resolveProfile({ cwd: tmpDir, profileId: "missing" }),
    ).rejects.toBeInstanceOf(KbError);
  });

  it("detects circular extends", async () => {
    await writeJson(path.join(tmpDir, "kb.config.json"), {
      profiles: [
        { id: "a", extends: "b" },
        { id: "b", extends: "a" },
      ],
    });

    await expect(
      resolveProfile({ cwd: tmpDir, profileId: "a" }),
    ).rejects.toBeInstanceOf(KbError);
  });

  it("loads profiles from npm packages", async () => {
    const pkgRoot = path.join(tmpDir, "node_modules", "@test", "preset");
    await fs.mkdir(pkgRoot, { recursive: true });
    await writeJson(path.join(pkgRoot, "package.json"), {
      name: "@test/preset",
      version: "1.0.0",
    });
    await writeJson(path.join(pkgRoot, "kb.config.json"), {
      profiles: [
        {
          id: "default",
          label: "Preset Profile",
          products: { aiReview: { engine: "openai" } },
          scopes: [{ id: "root", include: ["**/*"], default: true }],
        },
      ],
    });
    await writeJson(path.join(tmpDir, "kb.config.json"), {
      profiles: [
        {
          id: "workspace",
          extends: "@test/preset#default",
          products: { aiReview: { engine: "local" } },
        },
      ],
    });

    const result = await resolveProfile({
      cwd: tmpDir,
      profileId: "workspace",
    });

    expect(result.products?.aiReview).toEqual({ engine: "local" });
    expect(result.trace?.extends).toEqual(["npm:@test/preset#default"]);
  });
});
