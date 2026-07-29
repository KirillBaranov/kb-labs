import { describe, expect, it, vi } from "vitest";
import type { ILogger } from "../adapters/logger.js";
import { createContextLogger } from "./context.js";
import { logDiagnosticEvent } from "./diagnostic-events.js";

function createMockLogger(): ILogger {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => logger),
  };

  return logger as unknown as ILogger;
}

describe("logDiagnosticEvent", () => {
  it("logs structured reason codes and evidence", () => {
    const logger = createMockLogger() as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;

    logDiagnosticEvent(logger as unknown as ILogger, {
      event: "plugin.routes.validation",
      message: "Plugin route validation failed",
      reasonCode: "route_validation_failed",
      level: "warn",
      pluginId: "@kb-labs/test-plugin",
      issues: ["Route GET /broken: invalid handler reference"],
      evidence: { routeCount: 1 },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "Plugin route validation failed",
      expect.objectContaining({
        diagnosticDomain: "plugin",
        diagnosticEvent: "plugin.routes.validation",
        reasonCode: "route_validation_failed",
        pluginId: "@kb-labs/test-plugin",
        issues: ["Route GET /broken: invalid handler reference"],
        evidence: { routeCount: 1 },
      }),
    );
  });

  it("forwards errors on error-level diagnostic events", () => {
    const logger = createMockLogger() as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    const error = new Error("handler missing");

    logDiagnosticEvent(logger as unknown as ILogger, {
      event: "plugin.handler.resolve",
      message: "Plugin handler file not found",
      reasonCode: "handler_not_found",
      level: "error",
      error,
      handlerPath: "/tmp/plugin/dist/missing.js",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Plugin handler file not found",
      error,
      expect.objectContaining({
        diagnosticEvent: "plugin.handler.resolve",
        reasonCode: "handler_not_found",
        handlerPath: "/tmp/plugin/dist/missing.js",
      }),
    );
  });

  it("uses the context logger event envelope and only adds agent diagnostics when enabled", () => {
    const logger = createMockLogger() as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    const contextLogger = createContextLogger(logger as unknown as ILogger, {
      applicationId: "kb-labs",
      serviceId: "gateway",
      instanceId: "test",
      layer: "service",
    });

    logDiagnosticEvent(contextLogger, {
      event: "gateway.route.resolve",
      message: "Route resolution failed",
      reasonCode: "route_not_found",
      level: "error",
      issues: ["No route matches the request"],
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Route resolution failed",
      undefined,
      expect.objectContaining({
        event: "gateway.route.resolve",
        diagnosticEvent: "gateway.route.resolve",
        reasonCode: "route_not_found",
      }),
    );
    expect(logger.error!.mock.calls[0]?.[2]).not.toHaveProperty("diagnostic");
  });
});
