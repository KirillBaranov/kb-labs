import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emit } from "./emit-manifests.mjs";

test("emits explicit runtime launcher requirements into the packed dist directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "kb-create-emitter-"));
  const pkg = join(root, "adapter");
  mkdirSync(join(pkg, "dist"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@test/adapter", version: "1.2.3", kb: { manifest: "./dist/manifest.mjs" } }));
  writeFileSync(join(pkg, "dist", "manifest.mjs"), `export const manifest = { id: "test-adapter", launcher: { requirements: [{ id: "api-key", secret: true, env: "TEST_API_KEY", services: ["gateway"] }] } };`);

  await emit(root);
  const result = JSON.parse(readFileSync(join(pkg, "dist", "kb-create.manifest.json"), "utf8"));
  assert.deepEqual(result, {
    schema: "kb.create.artifact-manifest/v2",
    id: "test-adapter",
    package: "@test/adapter",
    version: "1.2.3",
    requirements: [{ id: "api-key", secret: true, env: "TEST_API_KEY", services: ["gateway"] }],
  });
});

test("rejects incomplete secret ownership instead of guessing it", async () => {
  const root = mkdtempSync(join(tmpdir(), "kb-create-emitter-"));
  const pkg = join(root, "adapter");
  mkdirSync(join(pkg, "dist"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@test/adapter", version: "1.2.3", kb: { manifest: "./dist/manifest.mjs" } }));
  writeFileSync(join(pkg, "dist", "manifest.mjs"), `export const manifest = { id: "test-adapter", launcher: { requirements: [{ id: "api-key", secret: true }] } };`);

  await assert.rejects(() => emit(root), /must declare env and services/);
});
