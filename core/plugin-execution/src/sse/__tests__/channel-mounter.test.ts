import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { NoOpLogger } from "@kb-labs/core-platform/noop";
import type { ManifestV3 } from "@kb-labs/plugin-contracts";
import type { ExecutionBackend } from "../../types.js";
import { mountEventStreams } from "../channel-mounter.js";

describe("mountEventStreams", () => {
  it("registers manifest-declared streams at the plugin base path", async () => {
    const server = Fastify();
    const manifest: ManifestV3 = {
      schema: "kb.plugin/3",
      id: "@test/realtime",
      version: "1.0.0",
      sse: {
        streams: [{ path: "/events", handler: "./rest/events.js#default" }],
      },
    };
    const backend = {} as ExecutionBackend;

    const result = await mountEventStreams(server, manifest, {
      backend,
      logger: new NoOpLogger(),
      serviceId: "rest",
      pluginRoot: "/tmp/plugin",
      workspaceRoot: "/tmp/workspace",
      basePath: "/api/plugins/@test/realtime",
    });

    expect(result).toEqual({ mounted: 1, errors: [] });
    expect(server.printRoutes()).toContain("api/plugins/@test/realtime/events");
    await server.close();
  });
});
