import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readProfilesSection } from "../profiles/loader";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { KbError } from "../errors/kb-error";

describe("readProfilesSection", () => {
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

  it("returns empty list when kb.config is missing", async () => {
    const result = await readProfilesSection(tmpDir);
    expect(result.profiles).toHaveLength(0);
    expect(result.sourcePath).toBeUndefined();
  });

  it("returns empty list when profiles section absent", async () => {
    await fs.writeFile(
      path.join(tmpDir, "kb.config.json"),
      JSON.stringify({ aiReview: { enabled: true } }, null, 2),
    );

    const result = await readProfilesSection(tmpDir);
    expect(result.profiles).toHaveLength(0);
    expect(result.sourcePath).toMatch(/kb\.config\.json$/);
  });

  it("parses valid profiles array", async () => {
    await fs.writeFile(
      path.join(tmpDir, "kb.config.json"),
      JSON.stringify(
        {
          profiles: [
            {
              id: "default",
              label: "Default profile",
              scopes: [{ id: "root", include: ["**/*"], default: true }],
              products: {
                aiReview: { engine: "openai" },
              },
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await readProfilesSection(tmpDir);
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]!.id).toBe("default");
    expect(result.profiles[0]!.products?.aiReview).toBeDefined();
  });

  it("throws KbError when profiles section invalid", async () => {
    await fs.writeFile(
      path.join(tmpDir, "kb.config.json"),
      JSON.stringify({ profiles: { invalid: true } }, null, 2),
    );

    await expect(readProfilesSection(tmpDir)).rejects.toBeInstanceOf(KbError);
  });
});
