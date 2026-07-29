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

  it("tears down on SIGINT too", async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);
    await runService(
      makeConfig({ setup: vi.fn().mockResolvedValue(teardown) }),
    );
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    await signalListeners.find(({ event }) => event === "SIGINT")!.fn();

    expect(teardown).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("shuts down the platform and rethrows when setup fails", async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
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

    const setupError = new Error("setup boom");
    await expect(
      runService(
        makeConfig({ setup: vi.fn().mockRejectedValue(setupError) }),
      ),
    ).rejects.toThrow("setup boom");

    expect(shutdown).toHaveBeenCalledWith("service.setup-failed");
  });

  it("exits with code 1 and logs when teardown fails", async () => {
    const teardownError = new Error("teardown boom");
    const teardown = vi.fn().mockRejectedValue(teardownError);
    const shutdown = vi.fn().mockResolvedValue(undefined);
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

    expect(shutdown).toHaveBeenCalledWith("signal:SIGTERM");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits with code 1 when platform shutdown fails after a clean teardown", async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);
    const shutdown = vi.fn().mockRejectedValue(new Error("shutdown boom"));
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

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("deduplicates concurrent shutdown signals", async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);
    const shutdown = vi.fn().mockResolvedValue(undefined);
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
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const sigterm = signalListeners.find(
      ({ event }) => event === "SIGTERM",
    )!.fn;
    const sigint = signalListeners.find(({ event }) => event === "SIGINT")!.fn;
    await Promise.all([sigterm(), sigint()]);

    expect(teardown).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("resolves port/host from the service transport adapter when available", async () => {
    const listenAddress = vi
      .fn()
      .mockReturnValue({ port: 4321, host: "10.0.0.5" });
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
      platform: {
        getAdapter: vi.fn().mockReturnValue({ listenAddress }),
      },
      logger,
      roots: {
        projectRoot: "/project",
        platformRoot: "/platform",
        sameLocation: false,
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    });

    const setup = vi
      .fn()
      .mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runService(
      makeConfig({ serviceId: "custom-service-id", setup }),
    );

    expect(listenAddress).toHaveBeenCalledWith("custom-service-id");
    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4321, host: "10.0.0.5" }),
    );
  });

  it("falls back to the port env var, KB_NET_OFFSET and hostEnvVar when there is no transport address", async () => {
    const originalPort = process.env.TEST_SERVICE_PORT;
    const originalOffset = process.env.KB_NET_OFFSET;
    const originalHost = process.env.TEST_SERVICE_HOST;
    process.env.TEST_SERVICE_PORT = "6000";
    process.env.KB_NET_OFFSET = "10";
    process.env.TEST_SERVICE_HOST = "192.168.1.1";

    const setup = vi
      .fn()
      .mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runService(makeConfig({ setup }));

    expect(setup).toHaveBeenCalledWith(
      expect.objectContaining({ port: 6010, host: "192.168.1.1" }),
    );

    if (originalPort === undefined) delete process.env.TEST_SERVICE_PORT;
    else process.env.TEST_SERVICE_PORT = originalPort;
    if (originalOffset === undefined) delete process.env.KB_NET_OFFSET;
    else process.env.KB_NET_OFFSET = originalOffset;
    if (originalHost === undefined) delete process.env.TEST_SERVICE_HOST;
    else process.env.TEST_SERVICE_HOST = originalHost;
  });
});
