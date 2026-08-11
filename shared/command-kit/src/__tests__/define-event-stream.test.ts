import { describe, expect, it, vi } from "vitest";
import type {
  EventStreamSender,
  PluginContextV3,
} from "@kb-labs/plugin-contracts";
import { defineEventStream } from "../define-event-stream.js";

const restContext = { host: "rest" } as PluginContextV3;

function createSender(): EventStreamSender {
  return {
    send: vi.fn(() => true),
    comment: vi.fn(() => true),
    onCleanup: vi.fn(),
    close: vi.fn(),
  };
}

describe("defineEventStream", () => {
  it("dispatches the stream lifecycle to declarative handlers", async () => {
    const sender = createSender();
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const onError = vi.fn();
    const stream = defineEventStream({
      path: "/events",
      handler: { onConnect, onDisconnect, onError },
    });

    await stream.execute(restContext, { event: "connect", sender });
    await stream.execute(restContext, {
      event: "error",
      sender,
      error: new Error("transport failed"),
    });
    await stream.execute(restContext, { event: "disconnect" });

    expect(onConnect).toHaveBeenCalledWith(restContext, sender);
    expect(onError).toHaveBeenCalledWith(
      restContext,
      expect.objectContaining({ message: "transport failed" }),
      sender,
    );
    expect(onDisconnect).toHaveBeenCalledWith(restContext);
  });

  it("rejects missing sender for connection lifecycle events", async () => {
    const stream = defineEventStream({ path: "/events", handler: {} });

    await expect(
      stream.execute(restContext, { event: "connect" }),
    ).rejects.toThrow("Event stream sender not provided");
  });

  it("rejects execution outside the REST host", async () => {
    const stream = defineEventStream({ path: "/events", handler: {} });
    const cliContext = { host: "cli" } as PluginContextV3;

    await expect(
      stream.execute(cliContext, { event: "disconnect" }),
    ).rejects.toThrow("can only run in rest host");
  });
});
