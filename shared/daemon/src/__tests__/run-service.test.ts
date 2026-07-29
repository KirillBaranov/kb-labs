import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launchPlatform: vi.fn(),
}));

vi.mock("@kb-labs/core-runtime", () => ({
  launchPlatform: mocks.launchPlatform,
}));

import { runService, type ServiceConfig } from "../index.js";

const signalListeners: Array<{ event: string; fn: () => Promise<void> }> = [];
const originalOn = process.on.bind(process);

function makeConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    appId: "test-service",
    defaultPort: 9999,
    portEnvVar: "TEST_SERVICE_PORT",
    defaultHost: "127.0.0.1",
    hostEnvVar: "TEST_SERVICE_HOST",
    platform: { assemblyHook: vi.fn() },
    setup: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
    ...overrides,
  };
}

describe("runService", () => {
  beforeEach(() => {
    const logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      forComponent: vi.fn(),
      event: vi.fn(),
    };
    logger.child.mockReturnValue(logger);
    logger.forComponent.mockReturnValue(logger);
    mocks.launchPlatform.mockResolvedValue({
      platform: { getAdapter: vi.fn().mockReturnValue(undefined) },
      logger,
      roots: {
        projectRoot: "/project",
        platformRoot: "/platform",
        sameLocation: false,
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(process, "on").mockImplementation((event: string | symbol, fn) => {
      if (event === "SIGTERM" || event === "SIGINT") {
        signalListeners.push({
          event: String(event),
          fn: fn as () => Promise<void>,
        });
        return process;
      }
      return originalOn(event, fn);
    });
  });

  afterEach(() => {
    signalListeners.length = 0;
    vi.restoreAllMocks();
  });

  it("launches the platform before running service setup", async () => {
    const setup = vi
      .fn()
      .mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runService(makeConfig({ setup }));

    expect(mocks.launchPlatform).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "test-service",
        kind: "service",
      }),
    );
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: "/project",
        platformRoot: "/platform",
        port: 9999,
        host: "127.0.0.1",
      }),
    );
  });

  it("tears down the service before the platform after SIGTERM", async () => {
    const order: string[] = [];
    const teardown = vi.fn().mockImplementation(async () => {
      order.push("teardown");
    });
    const shutdown = vi.fn().mockImplementation(async () => {
      order.push("platform");
    });
    const logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      forComponent: vi.fn(),
      event: vi.fn(),
    };
    logger.child.mockReturnValue(logger);
    logger.forComponent.mockReturnValue(logger);
    mocks.launchPlatform.mockResolvedValueOnce({
      platform: { getAdapter: vi.fn().mockReturnValue(undefined) },
      logger,
      roots: {
        projectRoot: "/project",
        platformRoot: "/platform",
        sameLocation: false,
      },
      shutdown,
    });

    await runService(
      makeConfig({ setup: vi.fn().mockResolvedValue(teardown) }),
    );
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    await signalListeners.find(({ event }) => event === "SIGTERM")!.fn();

    expect(order).toEqual(["teardown", "platform"]);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
