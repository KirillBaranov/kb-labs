import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ILogger } from "@kb-labs/core-platform";
import { createSseStream } from "../sse-stream.js";

function makeLogger(
  records: Array<{ message: string; fields?: Record<string, unknown> }>,
): ILogger {
  const logger: ILogger = {
    trace: (message, fields) => records.push({ message, fields }),
    debug: (message, fields) => records.push({ message, fields }),
    info: (message, fields) => records.push({ message, fields }),
    warn: (message, fields) => records.push({ message, fields }),
    error: (message, _error, fields) => records.push({ message, fields }),
    fatal: (message, _error, fields) => records.push({ message, fields }),
    child: () => logger,
  };
  return logger;
}

function makeReply() {
  const raw = Object.assign(new EventEmitter(), {
    writableEnded: false,
    destroyed: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(() => true),
    end: vi.fn(function end(this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  });
  return { raw, hijack: vi.fn() };
}

describe("createSseStream", () => {
  it("owns headers, event framing and one close summary", async () => {
    const records: Array<{
      message: string;
      fields?: Record<string, unknown>;
    }> = [];
    const reply = makeReply();
    const cleanup = vi.fn();
    const stream = createSseStream(
      {
        id: "req-1",
        headers: {},
        url: "/events",
        routeOptions: { url: "/events" },
      } as never,
      reply as never,
      { logger: makeLogger(records), serviceId: "rest", connectionId: "sse-1" },
    );

    stream.onCleanup(cleanup);
    stream.send("workflow.event", { id: 42 });
    stream.close("done");
    stream.close("again");
    await stream.closed;

    expect(reply.hijack).toHaveBeenCalledOnce();
    expect(reply.raw.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect(reply.raw.write).toHaveBeenCalledWith(
      'event: workflow.event\ndata: {"id":42}\n\n',
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(
      records.filter(
        (record) => record.fields?.event === "sse.connection.closed",
      ),
    ).toHaveLength(1);
    expect(
      records.find((record) => record.fields?.event === "sse.connection.closed")
        ?.fields,
    ).toMatchObject({
      eventsSent: 1,
      "network.transport": "sse",
      "network.connection_id": "sse-1",
    });
  });

  it("cleans up when the client closes the response", async () => {
    const reply = makeReply();
    const stream = createSseStream(
      { id: "req-1", headers: {}, url: "/events", routeOptions: {} } as never,
      reply as never,
      { logger: makeLogger([]), serviceId: "rest" },
    );
    reply.raw.emit("close");
    await stream.closed;
    expect(reply.raw.end).toHaveBeenCalledOnce();
  });

  it("notifies error observers before closing a broken transport", async () => {
    const reply = makeReply();
    const stream = createSseStream(
      { id: "req-1", headers: {}, url: "/events", routeOptions: {} } as never,
      reply as never,
      { logger: makeLogger([]), serviceId: "rest" },
    );
    const onError = vi.fn();
    stream.onError(onError);

    reply.raw.emit("error", new Error("socket closed"));
    await stream.closed;

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "socket closed" }),
    );
  });
});
