import { describe, expect, it } from "vitest";
import { createContextLogger, isAgentDiagnosticsEnabled } from "./context.js";
import type { ILogger } from "../adapters/logger.js";

function captureLogger(records: Array<Record<string, unknown>>): ILogger {
  const write = (
    level: string,
    message: string,
    meta?: Record<string, unknown>,
  ) => {
    records.push({ level, message, ...(meta ?? {}) });
  };
  return {
    trace: (message, meta) => write("trace", message, meta),
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, error, meta) =>
      write("error", message, { ...(meta ?? {}), ...(error ? { error } : {}) }),
    fatal: (message, error, meta) =>
      write("fatal", message, { ...(meta ?? {}), ...(error ? { error } : {}) }),
    child: () => captureLogger(records),
  };
}

describe("createContextLogger", () => {
  it("inherits platform and correlation identity when a plugin creates children", () => {
    const records: Array<Record<string, unknown>> = [];
    const parent = createContextLogger(captureLogger(records), {
      applicationId: "rest",
      serviceId: "rest",
      instanceId: "host:1",
      layer: "service",
    }).forOperation("http.request", {
      requestId: "request-1",
      traceId: "trace-1",
    });

    parent
      .forPlugin({ pluginId: "release", pluginVersion: "1.0.0" })
      .child({
        requestId: "plugin-value",
        traceId: "plugin-trace",
        "plugin.task": "publish",
      })
      .info("Plugin completed", {
        requestId: "record-value",
        pluginId: "other",
      });

    expect(records).toEqual([
      expect.objectContaining({
        applicationId: "rest",
        serviceId: "rest",
        instanceId: "host:1",
        requestId: "request-1",
        traceId: "trace-1",
        pluginId: "release",
        pluginVersion: "1.0.0",
        "plugin.task": "publish",
      }),
    ]);
  });

  it("emits agent remediation only when diagnostics are explicitly enabled", () => {
    const records: Array<Record<string, unknown>> = [];
    const logger = createContextLogger(captureLogger(records), {
      applicationId: "rest",
      serviceId: "rest",
      instanceId: "host:1",
      layer: "service",
    });
    const original = process.env.KB_DIAGNOSTICS;
    delete process.env.KB_DIAGNOSTICS;
    logger.event("warn", {
      event: "adapter.degraded",
      diagnostic: { summary: "Redis is unavailable", confidence: "high" },
    });
    process.env.KB_DIAGNOSTICS = "agent";
    logger.event("warn", {
      event: "adapter.degraded",
      diagnostic: { summary: "Redis is unavailable", confidence: "high" },
    });
    if (original === undefined) {
      delete process.env.KB_DIAGNOSTICS;
    } else {
      process.env.KB_DIAGNOSTICS = original;
    }

    expect(records[0]).not.toHaveProperty("diagnostic");
    expect(records[1]).toMatchObject({
      diagnostic: { summary: "Redis is unavailable" },
    });
    expect(isAgentDiagnosticsEnabled({ KB_DIAGNOSTICS: "agent" })).toBe(true);
  });

  it("preserves Pino-compatible fields-first calls from Fastify and plugins", () => {
    const records: Array<Record<string, unknown>> = [];
    const logger = createContextLogger(captureLogger(records), {
      applicationId: "kb-labs",
      serviceId: "rest",
      instanceId: "test",
      layer: "service",
    });

    (
      logger.info as unknown as (
        fields: Record<string, unknown>,
        message: string,
      ) => void
    )(
      { pluginId: "@kb-labs/test", "http.route": "/plugins/test" },
      "Mounted route",
    );

    expect(records).toContainEqual(
      expect.objectContaining({
        message: "Mounted route",
        pluginId: "@kb-labs/test",
        "http.route": "/plugins/test",
        serviceId: "rest",
      }),
    );
  });
});
