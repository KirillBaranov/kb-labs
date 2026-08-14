#!/usr/bin/env node

// Compose the launcher-index input from the platform flow's staged tarballs
// plus an already-published SDK tarball. The SDK is intentionally excluded
// from platform delivery: it has its own release cadence, but the platform
// index still needs a verified exact SDK candidate for resolution.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const stagePath = value("--stage-manifest");
const sdkTarball = value("--sdk-tarball");
const output = value("--output");
if (!stagePath || !sdkTarball || !output) throw new Error("--stage-manifest, --sdk-tarball and --output are required");

const stage = JSON.parse(readFileSync(stagePath, "utf8"));
const packageJson = JSON.parse(execFileSync("tar", ["-xOzf", sdkTarball, "package/package.json"], { encoding: "utf8" }));
if (packageJson.name !== "@kb-labs/sdk" || typeof packageJson.version !== "string") throw new Error("SDK tarball has unexpected package identity");
const hash = createHash("sha256").update(readFileSync(sdkTarball)).digest("hex");
const destination = resolve(output);
mkdirSync(destination, { recursive: true });
const manifest = [
  ...stage.map(item => ({ ...item, tarball: relative(destination, resolve(dirname(stagePath), item.tarball)) })),
  { name: packageJson.name, version: packageJson.version, tarball: relative(destination, resolve(sdkTarball)), sha256: hash },
];
if (new Set(manifest.map(item => item.name)).size !== manifest.length) throw new Error("SDK is already present in platform delivery stage");
writeFileSync(resolve(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
