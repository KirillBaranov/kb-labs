import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerManifests } from "../register";
import { runCommand } from "../run";
import { renderHelp } from "../../utils/help-generator";
import type { ManifestV3 } from "@kb-labs/plugin-contracts";
import type { CommandManifest } from "../types";


const baseManifestV3: ManifestV3 = {
  schema: "kb.plugin/3",
  id: "@kb-labs/test-plugin",
  version: "0.0.1",
  permissions: {},
  cli: {
    commands: [
      {
        id: "test:command",
        describe: "Test command",
        handler: "./cli/command.js",
        flags: [],
      },
    ],
  },
};

/**
 * These tests exercise the registry pipeline using synthetic discovery results
 * so we can verify behaviour without hitting the filesystem.
 */

describe("Registry Integration", () => {
  const mockRegistry = {
    registerManifest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a workspace manifest and executes successfully", async () => {
    const manifest: CommandManifest = {
      manifestVersion: "1.0",
      id: "test:command",
      group: "test",
      describe: "Test command",
      flags: [{ name: "verbose", type: "boolean", alias: "v" }],
      manifestV2: structuredClone(baseManifestV3),
      loader: async () => ({
        run: async (ctx: any, _argv: string[], flags: any) => {
          ctx.presenter.info(flags.verbose ? "Verbose mode enabled" : "Run executed");
          return 0;
        },
      }),
    };

    const discoveryResults = [
      {
        source: "workspace" as const,
        packageName: "@kb-labs/test-package",
        manifestPath: "/virtual/manifest.mjs",
        pkgRoot: "/virtual/pkg",
        manifests: [manifest],
      },
    ];

    const { registered } = await registerManifests(discoveryResults, mockRegistry as any);
    expect(registered).toHaveLength(1);
    const cmd = registered[0]!;
    expect(cmd.available).toBe(true);
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(cmd);

    const mockCtx = {
      presenter: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        json: vi.fn(),
      },
      diagnostics: [],
    };

    const exitCode = await runCommand(cmd, mockCtx, ["arg1"], {
      verbose: true,
    });

    expect(exitCode).toBe(0);

    const helpText = renderHelp(registered, {
      json: false,
      onlyAvailable: false,
    });
    expect(helpText).toContain("test command");
    expect(helpText).toContain("Test command");

    const helpJson = renderHelp(registered, {
      json: true,
      onlyAvailable: false,
    });
    expect(helpJson).toHaveProperty("groups");
    expect((helpJson as any).groups[0].commands[0].id).toBe("test:command");
  });

  it("propagates unavailable command metadata", async () => {
    const manifest: CommandManifest = {
      manifestVersion: "1.0",
      id: "test:command",
      group: "test",
      describe: "Test command",
      requires: ["@kb-labs/missing-package"],
      manifestV2: structuredClone(baseManifestV3),
      loader: async () => ({ run: async () => 0 }),
    };

    const discoveryResults = [
      {
        source: "workspace" as const,
        packageName: "@kb-labs/test-package",
        manifestPath: "/virtual/manifest.mjs",
        pkgRoot: "/virtual/pkg",
        manifests: [manifest],
      },
    ];

    const { registered } = await registerManifests(discoveryResults, mockRegistry as any);
    expect(registered).toHaveLength(1);
    const unavailable = registered[0]!;
    expect(unavailable.available).toBe(false);

    const mockCtx = {
      presenter: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        json: vi.fn(),
      },
      diagnostics: [],
    };

    const exitCode = await runCommand(unavailable, mockCtx, [], { json: true });
    expect(exitCode).toBe(2);
    expect(mockCtx.presenter.json).toHaveBeenCalledWith({
      ok: false,
      available: false,
      command: "test:command",
      reason: "Missing dependency: @kb-labs/missing-package",
      hint: "Run: pnpm add @kb-labs/missing-package",
    });
  });

  it("prefers workspace manifests over node_modules", async () => {
    const nodeManifest: CommandManifest = {
      manifestVersion: "1.0",
      id: "test:command",
      group: "test",
      describe: "Node command",
      manifestV2: structuredClone(baseManifestV3),
      loader: async () => ({ run: async () => 0 }),
    };

    const workspaceManifest: CommandManifest = {
      manifestVersion: "1.0",
      id: "test:command",
      group: "test",
      describe: "Workspace command",
      manifestV2: structuredClone(baseManifestV3),
      loader: async () => ({ run: async () => 0 }),
    };

    const discoveryResults = [
      {
        source: "node_modules" as const,
        packageName: "@kb-labs/node-package",
        manifestPath: "/virtual/node-manifest.mjs",
        pkgRoot: "/virtual/node",
        manifests: [nodeManifest],
      },
      {
        source: "workspace" as const,
        packageName: "@kb-labs/workspace-package",
        manifestPath: "/virtual/workspace-manifest.mjs",
        pkgRoot: "/virtual/workspace",
        manifests: [workspaceManifest],
      },
    ];

    const { registered } = await registerManifests(discoveryResults, mockRegistry as any);
    expect(registered).toHaveLength(1);
    expect(registered[0]?.source).toBe("workspace");
    expect(mockRegistry.registerManifest).toHaveBeenCalledWith(registered[0]);
  });
});
