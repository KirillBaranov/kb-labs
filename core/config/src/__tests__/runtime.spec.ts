import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  findNearestConfig,
  readJsonWithDiagnostics,
  mergeDefined,
  resolveConfig,
  pickDefined,
} from "../runtime";

async function makeTmpDir(prefix = "kb-core-config-") {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function rmDirSafe(dir: string) {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {}
}

describe("runtime utils", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmpDir();
  });

  afterEach(async () => {
    await rmDirSafe(tmp);
  });

  describe("findNearestConfig", () => {
    it("walks up directories and finds the nearest file", async () => {
      const a = path.join(tmp, "a");
      const b = path.join(a, "b");
      await fsp.mkdir(b, { recursive: true });
      const rc = path.join(a, ".sentinelrc.json");
      await fsp.writeFile(rc, "{}", "utf8");

      const res = await findNearestConfig({
        startDir: b,
        filenames: [".sentinelrc.json"],
      });
      expect(res.path).toBe(rc);
      expect(res.tried.length).toBeGreaterThan(0);
      expect(path.isAbsolute(res.path!)).toBe(true);
    });

    it("respects stopDir boundary", async () => {
      const a = path.join(tmp, "a");
      const b = path.join(a, "b");
      const c = path.join(b, "c");
      await fsp.mkdir(c, { recursive: true });
      const rc = path.join(tmp, ".sentinelrc.json");
      await fsp.writeFile(rc, "{}", "utf8");

      const res = await findNearestConfig({
        startDir: c,
        stopDir: a,
        filenames: [".sentinelrc.json"],
      });
      expect(res.path).toBeNull();
      expect(res.tried.some((p) => p.endsWith(".sentinelrc.json"))).toBe(true);
    });
  });

  describe("readJsonWithDiagnostics", () => {
    it("returns ok with data on valid JSON", async () => {
      const file = path.join(tmp, "ok.json");
      await fsp.writeFile(file, '{"x":1}', "utf8");
      const res = await readJsonWithDiagnostics<{ x: number }>(file);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.x).toBe(1);
      }
      expect(res.diagnostics).toEqual([]);
    });

    it("returns diagnostics on parse error", async () => {
      const file = path.join(tmp, "bad.json");
      await fsp.writeFile(file, "{x:}", "utf8");
      const res = await readJsonWithDiagnostics(file);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(
          res.diagnostics.find((d) => d.code === "JSON_PARSE_FAILED"),
        ).toBeTruthy();
      }
    });

    it("returns diagnostics on read error", async () => {
      const file = path.join(tmp, "missing.json");
      const res = await readJsonWithDiagnostics(file);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(
          res.diagnostics.find((d) => d.code === "FILE_READ_FAILED"),
        ).toBeTruthy();
      }
    });
  });

  describe("mergeDefined", () => {
    it("deep merges objects and arrays ignoring undefined", () => {
      const base = { a: 1, b: { x: 1, y: [1] }, c: [1, 2], d: "keep" };
      const over = {
        a: undefined,
        b: { y: [2], z: 3 },
        c: [3],
        d: "set",
        e: 5,
      } as any;
      const m = mergeDefined(base, over);
      expect(m).toEqual({
        a: 1,
        b: { x: 1, y: [1, 2], z: 3 },
        c: [1, 2, 3],
        d: "set",
        e: 5,
      });
    });

    it("overlay wins on different types when defined", () => {
      const base = { a: 1 as any };
      const over = { a: { z: 1 } as any };
      const m = mergeDefined(base, over);
      expect(m.a).toEqual({ z: 1 });
    });
  });

  describe("pickDefined", () => {
    it("picks only defined values", () => {
      const res = pickDefined({ a: 1, b: undefined, c: false } as any);
      expect(Object.prototype.hasOwnProperty.call(res, "b")).toBe(false);
      expect(res).toEqual({ a: 1, c: false });
    });
  });

  describe("resolveConfig", () => {
    it("applies precedence: defaults < file < env < cli; and validate", () => {
      const defaults = { a: 1, b: { x: 1 }, c: "d", f: 0 };
      const file = { a: 2, b: { y: 2 } };
      const envMapper = (env: NodeJS.ProcessEnv) => ({
        b: { x: Number(env.TEST_X ?? 1), z: Number(env.TEST_Z ?? 0) },
        c: env.TEST_C,
      });
      const cli = { c: "cli", f: undefined as unknown as number };
      const validate = (cfg: typeof defaults) => ({
        ok: cfg.a > 0,
        diagnostics: [
          { level: "info" as const, code: "VALIDATED", message: "ok" },
        ],
      });

      const { value, diagnostics } = resolveConfig({
        defaults,
        fileConfig: file as any,
        envMapper,
        cliOverrides: cli,
        validate,
      });

      expect(value).toEqual({
        a: 2,
        b: { x: 1, y: 2, z: 0 },
        c: "cli",
        f: 0,
        profiles: {
          rootDir: ".kb/profiles",
          defaultName: "default",
          strict: true,
        },
      });
      expect(diagnostics.some((d) => d.code === "VALIDATED")).toBe(true);
    });

    it("env mapper reads real env; can be stubbed", () => {
      vi.stubEnv("TEST_Z", "5");
      const defaults = { b: { z: 0 } };
      const { value } = resolveConfig({
        defaults: defaults as any,
        envMapper: (e) => ({ b: { z: Number(e.TEST_Z) } }),
      });
      expect(value).toEqual({
        b: { z: 5 },
        profiles: {
          rootDir: ".kb/profiles",
          defaultName: "default",
          strict: true,
        },
      });
      vi.unstubAllEnvs();
    });
  });
});
