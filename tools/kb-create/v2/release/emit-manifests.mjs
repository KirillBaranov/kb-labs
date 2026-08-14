#!/usr/bin/env node

/**
 * Emit the small, JSON-only V2 launcher projection beside a built package.
 *
 * This is deliberately release-workflow tooling, not a release-plugin
 * feature: it runs after the workspace build and before `kb release stage`.
 * The following stage then packs this exact file into `dist/`, and all later
 * launcher validation reads only the staged tarball bytes.
 *
 * Runtime manifests remain the source of truth for configuration. A package
 * which has `kb.manifest` may opt into the explicit `manifest.launcher`
 * projection. Packages without a runtime manifest receive an identity-only
 * projection; they cannot accidentally invent configuration requirements.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA = "kb.create.artifact-manifest/v2";

function fail(message) {
  throw new Error(`kb-create manifest emission: ${message}`);
}

function packageFiles(root) {
  const result = [];
  const ignored = new Set([".git", ".kb", "node_modules", "dist", "coverage"]);
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) visit(join(directory, entry.name));
        continue;
      }
      if (entry.name === "package.json") result.push(join(directory, entry.name));
    }
  }
  visit(root);
  return result;
}

function validateRequirement(requirement, owner) {
  if (!requirement || typeof requirement !== "object" || typeof requirement.id !== "string" || requirement.id.length === 0) {
    fail(`${owner} has a launcher requirement without an id`);
  }
  if (!requirement.secret && (typeof requirement.path !== "string" || requirement.path.length === 0)) {
    fail(`${owner} requirement ${requirement.id} must declare a config path`);
  }
  if (requirement.secret) {
    if (typeof requirement.env !== "string" || requirement.env.length === 0 || !Array.isArray(requirement.services) || requirement.services.length === 0) {
      fail(`${owner} secret requirement ${requirement.id} must declare env and services`);
    }
    if (Object.hasOwn(requirement, "default")) {
      fail(`${owner} secret requirement ${requirement.id} must not declare a default`);
    }
  }
}

function projection(packageJson, runtimeManifest) {
  const launcher = runtimeManifest?.launcher ?? {};
  if (!launcher || typeof launcher !== "object" || Array.isArray(launcher)) {
    fail(`${packageJson.name} manifest.launcher must be an object`);
  }
  const requirements = launcher.requirements ?? [];
  if (!Array.isArray(requirements)) fail(`${packageJson.name} manifest.launcher.requirements must be an array`);
  for (const requirement of requirements) validateRequirement(requirement, packageJson.name);
  return {
    schema: SCHEMA,
    // Runtime manifest ids are meaningful to people and scenarios. Packages
    // without one use their npm name as a stable, collision-free identity.
    id: runtimeManifest?.id ?? packageJson.kbCreate?.id ?? packageJson.name,
    package: packageJson.name,
    version: packageJson.version,
    requirements,
  };
}

async function runtimeManifest(packageDirectory, packageJson) {
  if (!packageJson.kb?.manifest) return undefined;
  const manifestPath = resolve(packageDirectory, packageJson.kb.manifest);
  if (!existsSync(manifestPath)) fail(`${packageJson.name} declares kb.manifest but ${relative(packageDirectory, manifestPath)} was not built`);
  let module;
  try {
    module = await import(pathToFileURL(manifestPath).href);
  } catch (error) {
    fail(`could not load ${packageJson.name} runtime manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = module.manifest ?? module.default;
  if (!value || typeof value !== "object") fail(`${packageJson.name} runtime manifest exports no manifest object`);
  return value;
}

export async function emit(workspaceRoot) {
  const written = [];
  for (const packageFile of packageFiles(workspaceRoot)) {
    const packageDirectory = dirname(packageFile);
    const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
    if (packageJson.private || typeof packageJson.name !== "string" || typeof packageJson.version !== "string") continue;
    const dist = join(packageDirectory, "dist");
    // Only publishable, built packages may be staged. Do not manufacture a
    // manifest for a source-only package that `pnpm pack` would not include.
    if (!existsSync(dist)) continue;
    const manifest = projection(packageJson, await runtimeManifest(packageDirectory, packageJson));
    const target = join(dist, "kb-create.manifest.json");
    writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    written.push({ package: packageJson.name, target: relative(workspaceRoot, target) });
  }
  if (written.length === 0) fail("found no built publishable packages");
  return written;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[2] ?? process.cwd());
  emit(root).then(written => process.stdout.write(`${JSON.stringify({ ok: true, manifests: written }, null, 2)}\n`));
}
