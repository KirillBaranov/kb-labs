import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { platform } from "../container.js";
import { launchPlatform, resetPlatformRuntime } from "../platform-launch.js";

const assemblyHook = (
  _raw: object,
  _broker: unknown,
  config: Partial<Record<string, unknown>>,
) => config;

describe("launchPlatform", () => {
  let projectRoot: string;
  let previousSocketHash: string | undefined;

  beforeEach(async () => {
    resetPlatformRuntime();
    projectRoot = await mkdtemp(path.join(tmpdir(), "kb-platform-launch-"));
    previousSocketHash = process.env.KB_SOCKET_HASH;
    delete process.env.KB_SOCKET_HASH;
  });

  afterEach(async () => {
    resetPlatformRuntime();
    await rm(projectRoot, { recursive: true, force: true });
    delete process.env.PLATFORM_LAUNCH_TEST;
    if (previousSocketHash === undefined) {
      delete process.env.KB_SOCKET_HASH;
    } else {
      process.env.KB_SOCKET_HASH = previousSocketHash;
    }
  });

  it("owns config, env and platform initialisation for a service", async () => {
    await writeFile(
      path.join(projectRoot, ".env"),
      "PLATFORM_LAUNCH_TEST=value\n",
    );
    delete process.env.PLATFORM_LAUNCH_TEST;

    const runtime = await launchPlatform({
      applicationId: "test-service",
      kind: "service",
      startDir: projectRoot,
      assemblyHook,
    });

    expect(runtime.platform).toBe(platform);
    expect(runtime.roots.projectRoot).toBe(projectRoot);
    expect(process.env.PLATFORM_LAUNCH_TEST).toBe("value");
    expect(process.env.KB_SOCKET_HASH).toMatch(/^[0-9a-f]{8}$/);
    expect(runtime.startupReport.applicationId).toBe("test-service");
  });

  it("is idempotent for one application identity", async () => {
    const first = await launchPlatform({
      applicationId: "test-service",
      kind: "service",
      startDir: projectRoot,
      assemblyHook,
    });
    const second = await launchPlatform({
      applicationId: "test-service",
      kind: "service",
      startDir: projectRoot,
      assemblyHook,
    });

    expect(second).toBe(first);
  });

  it("rejects a second application identity in one process", async () => {
    await launchPlatform({
      applicationId: "first-service",
      kind: "service",
      startDir: projectRoot,
      assemblyHook,
    });

    await expect(
      launchPlatform({
        applicationId: "second-service",
        kind: "service",
        startDir: projectRoot,
        assemblyHook,
      }),
    ).rejects.toThrow("Platform is already launched");
  });
});
