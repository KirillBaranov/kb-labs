/**
 * @module @kb-labs/core-platform/adapters/adapter-manifest
 * Tests for adapter manifest types.
 *
 * NOTE: These are TypeScript compile-time tests.
 * We trust the TypeScript compiler for type safety (no runtime validation).
 */

import { describe, it, expect } from "vitest";
import type {
  AdapterManifest,
  AdapterType,
  AdapterDependency,
  AdapterExtension,
  AdapterCapabilities,
  AdapterFactory,
} from "./adapter-manifest.js";

describe("AdapterManifest", () => {
  describe("Core Adapter Manifest", () => {
    it("should define valid core adapter manifest (Pino logger)", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "pino-logger",
        name: "Pino Logger",
        version: "1.0.0",
        description: "Production-ready structured logger based on Pino",
        type: "core",
        implements: "ILogger",
        optional: {
          adapters: ["analytics"],
        },
        capabilities: {
          streaming: true,
        },
      };

      expect(manifest.id).toBe("pino-logger");
      expect(manifest.type).toBe("core");
      expect(manifest.implements).toBe("ILogger");
      expect(manifest.capabilities?.streaming).toBe(true);
    });

    it("should define minimal core adapter manifest", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "simple-logger",
        name: "Simple Logger",
        version: "1.0.0",
        type: "core",
        implements: "ILogger",
      };

      expect(manifest.id).toBe("simple-logger");
      expect(manifest.description).toBeUndefined();
      expect(manifest.requires).toBeUndefined();
      expect(manifest.capabilities).toBeUndefined();
    });
  });

  describe("Extension Adapter Manifest", () => {
    it("should define extension adapter without dependencies (ring buffer)", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "log-ringbuffer",
        name: "Log Ring Buffer",
        version: "1.0.0",
        type: "extension",
        implements: "ILogRingBuffer",
        extends: {
          adapter: "logger",
          hook: "onLog",
          method: "append",
          priority: 10,
        },
        capabilities: {
          streaming: true,
        },
      };

      expect(manifest.type).toBe("extension");
      expect(manifest.extends?.adapter).toBe("logger");
      expect(manifest.extends?.hook).toBe("onLog");
      expect(manifest.extends?.method).toBe("append");
      expect(manifest.extends?.priority).toBe(10);
    });

    it("should define extension adapter with dependencies (SQLite persistence)", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "log-persistence",
        name: "SQLite Log Persistence",
        version: "1.0.0",
        type: "extension",
        implements: "ILogPersistence",
        requires: {
          adapters: [{ id: "db", alias: "database" }],
          platform: ">= 1.0.0",
        },
        extends: {
          adapter: "logger",
          hook: "onLog",
          method: "write",
          priority: 5,
        },
        capabilities: {
          batch: true,
          search: true,
          transactions: true,
        },
      };

      expect(manifest.requires?.adapters).toHaveLength(1);
      expect(manifest.requires?.platform).toBe(">= 1.0.0");
      expect(manifest.capabilities?.batch).toBe(true);
      expect(manifest.capabilities?.search).toBe(true);
      expect(manifest.capabilities?.transactions).toBe(true);
    });

    it("should support default priority (0) when not specified", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "log-extension",
        name: "Log Extension",
        version: "1.0.0",
        type: "extension",
        implements: "ILogExtension",
        extends: {
          adapter: "logger",
          hook: "onLog",
          method: "handle",
          // priority not specified - defaults to 0
        },
      };

      expect(manifest.extends?.priority).toBeUndefined();
    });
  });

  describe("Proxy Adapter Manifest", () => {
    it("should define proxy adapter manifest (IPC proxy)", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "logger-ipc-proxy",
        name: "Logger IPC Proxy",
        version: "1.0.0",
        type: "proxy",
        implements: "ILogger",
        description: "IPC proxy for cross-process logger communication",
      };

      expect(manifest.type).toBe("proxy");
    });
  });

  describe("Adapter Dependencies", () => {
    it("should support short-form dependencies (string)", () => {
      const deps: AdapterDependency[] = ["db", "cache", "analytics"];

      expect(deps).toHaveLength(3);
      expect(deps[0]).toBe("db");
    });

    it("should support long-form dependencies with aliases", () => {
      const deps: AdapterDependency[] = [
        { id: "db", alias: "database" },
        { id: "cache" }, // No alias
        "analytics", // Short form
      ];

      expect(deps).toHaveLength(3);
      expect(typeof deps[0]).toBe("object");
      if (typeof deps[0] === "object") {
        expect(deps[0].id).toBe("db");
        expect(deps[0].alias).toBe("database");
      }
    });

    it("should support mixed required and optional dependencies", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "complex-adapter",
        name: "Complex Adapter",
        version: "1.0.0",
        type: "core",
        implements: "IComplexAdapter",
        requires: {
          adapters: ["db", { id: "cache", alias: "cacheService" }],
        },
        optional: {
          adapters: ["analytics", "metrics"],
        },
      };

      expect(manifest.requires?.adapters).toHaveLength(2);
      expect(manifest.optional?.adapters).toHaveLength(2);
    });
  });

  describe("Adapter Capabilities", () => {
    it("should support boolean capabilities", () => {
      const capabilities: AdapterCapabilities = {
        streaming: true,
        batch: false,
        search: true,
        transactions: false,
      };

      expect(capabilities.streaming).toBe(true);
      expect(capabilities.batch).toBe(false);
    });

    it("should support custom capabilities", () => {
      const capabilities: AdapterCapabilities = {
        streaming: true,
        custom: {
          maxBatchSize: 1000,
          retryAttempts: 3,
          supportedFormats: ["json", "csv", "parquet"],
        },
      };

      expect(capabilities.custom?.maxBatchSize).toBe(1000);
      expect(capabilities.custom?.retryAttempts).toBe(3);
      expect(Array.isArray(capabilities.custom?.supportedFormats)).toBe(true);
    });

    it("should allow empty capabilities object", () => {
      const capabilities: AdapterCapabilities = {};

      expect(Object.keys(capabilities)).toHaveLength(0);
    });
  });

  describe("AdapterFactory", () => {
    it("should define sync factory function", () => {
      interface MockConfig {
        level: string;
      }
      interface MockDeps {
        analytics?: unknown;
      }
      interface MockLogger {
        log: (msg: string) => void;
      }

      const factory: AdapterFactory<MockConfig, MockDeps, MockLogger> = (
        config,
        deps,
      ) => {
        return {
          log: (msg: string) => {
            console.log(`[${config.level}] ${msg}`);
            if (deps.analytics) {
              // Track to analytics
            }
          },
        };
      };

      const logger = factory({ level: "info" }, {}) as MockLogger;
      expect(logger.log).toBeDefined();
    });

    it("should define async factory function", () => {
      interface MockConfig {
        connectionString: string;
      }
      interface MockDeps {
        cache: unknown;
      }
      interface MockDB {
        query: (sql: string) => Promise<unknown>;
      }

      const factory: AdapterFactory<MockConfig, MockDeps, MockDB> = async (
        config,
        deps,
      ) => {
        // Async initialization
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });

        return {
          query: async (sql: string) => {
            // Execute query
            return [];
          },
        };
      };

      expect(factory).toBeDefined();
    });

    it("should support factory with no dependencies", () => {
      const factory: AdapterFactory<{ size: number }, Record<string, never>, unknown> = (
        config,
      ) => {
        return { size: config.size };
      };

      const instance = factory({ size: 100 }, {});
      expect(instance).toEqual({ size: 100 });
    });
  });

  describe("Manifest Versioning", () => {
    it("should require semver version strings", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "versioned-adapter",
        name: "Versioned Adapter",
        version: "2.3.1",
        type: "core",
        implements: "IAdapter",
        requires: {
          platform: ">= 1.0.0",
        },
      };

      expect(manifest.manifestVersion).toBe("1.0.0");
      expect(manifest.version).toBe("2.3.1");
      expect(manifest.requires?.platform).toBe(">= 1.0.0");
    });

    it("should support semver ranges in platform requirements", () => {
      const ranges = [
        ">= 1.0.0",
        "^1.2.0",
        "~1.2.3",
        "1.2.x",
        ">=1.0.0 <2.0.0",
      ];

      ranges.forEach((range) => {
        const manifest: AdapterManifest = {
          manifestVersion: "1.0.0",
          id: "test",
          name: "Test",
          version: "1.0.0",
          type: "core",
          implements: "ITest",
          requires: {
            platform: range,
          },
        };

        expect(manifest.requires?.platform).toBe(range);
      });
    });
  });

  describe("Type Constraints", () => {
    it("should only allow valid adapter types", () => {
      const validTypes: AdapterType[] = ["core", "extension", "proxy"];

      validTypes.forEach((type) => {
        const manifest: AdapterManifest = {
          manifestVersion: "1.0.0",
          id: "test",
          name: "Test",
          version: "1.0.0",
          type,
          implements: "ITest",
        };

        expect(["core", "extension", "proxy"]).toContain(manifest.type);
      });
    });

    it("should allow extension without priority (defaults to 0)", () => {
      const extension: AdapterExtension = {
        adapter: "logger",
        hook: "onLog",
        method: "handle",
      };

      expect(extension.priority).toBeUndefined();
    });

    it("should allow extension with explicit priority", () => {
      const extension: AdapterExtension = {
        adapter: "logger",
        hook: "onLog",
        method: "handle",
        priority: 42,
      };

      expect(extension.priority).toBe(42);
    });
  });

  describe("Real-world Examples", () => {
    it("should compile example from ADR: Pino Logger", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "pino-logger",
        name: "Pino Logger",
        version: "1.0.0",
        type: "core",
        implements: "ILogger",
        optional: { adapters: ["analytics"] },
        capabilities: { streaming: true },
      };

      expect(manifest).toBeDefined();
    });

    it("should compile example from ADR: Ring Buffer", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "log-ringbuffer",
        name: "Log Ring Buffer",
        version: "1.0.0",
        type: "extension",
        implements: "ILogRingBuffer",
        extends: {
          adapter: "logger",
          hook: "onLog",
          method: "append",
          priority: 10,
        },
        capabilities: { streaming: true },
      };

      expect(manifest).toBeDefined();
    });

    it("should compile example from ADR: SQLite Persistence", () => {
      const manifest: AdapterManifest = {
        manifestVersion: "1.0.0",
        id: "log-persistence",
        name: "SQLite Log Persistence",
        version: "1.0.0",
        type: "extension",
        implements: "ILogPersistence",
        requires: {
          adapters: [{ id: "db", alias: "database" }],
          platform: ">= 1.0.0",
        },
        extends: {
          adapter: "logger",
          hook: "onLog",
          method: "write",
          priority: 5,
        },
        capabilities: { batch: true, search: true, transactions: true },
      };

      expect(manifest).toBeDefined();
    });
  });
});
