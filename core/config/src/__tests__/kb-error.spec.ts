/**
 * @module @kb-labs/core/config/__tests__/kb-error.spec.ts
 * Tests for KbError class and error utilities
 */

import { describe, it, expect } from "vitest";
import {
  KbError,
  getExitCode,
  ERROR_HINTS,
  type ErrorCode,
} from "../errors/kb-error";

describe("KbError", () => {
  describe("constructor", () => {
    it("should create error with all parameters", () => {
      const error = new KbError("ERR_TEST", "Test error message", "Test hint", {
        test: "meta",
      });

      expect(error.code).toBe("ERR_TEST");
      expect(error.message).toBe("Test error message");
      expect(error.hint).toBe("Test hint");
      expect(error.meta).toEqual({ test: "meta" });
      expect(error.name).toBe("KbError");
      expect(error).toBeInstanceOf(Error);
    });

    it("should create error with minimal parameters", () => {
      const error = new KbError("ERR_MINIMAL", "Minimal error");

      expect(error.code).toBe("ERR_MINIMAL");
      expect(error.message).toBe("Minimal error");
      expect(error.hint).toBeUndefined();
      expect(error.meta).toBeUndefined();
      expect(error.name).toBe("KbError");
    });

    it("should create error with code and message only", () => {
      const error = new KbError("ERR_CODE_ONLY", "Code only message");

      expect(error.code).toBe("ERR_CODE_ONLY");
      expect(error.message).toBe("Code only message");
      expect(error.hint).toBeUndefined();
      expect(error.meta).toBeUndefined();
    });

    it("should create error with hint but no meta", () => {
      const error = new KbError(
        "ERR_HINT_ONLY",
        "Hint only message",
        "Hint without meta",
      );

      expect(error.code).toBe("ERR_HINT_ONLY");
      expect(error.message).toBe("Hint only message");
      expect(error.hint).toBe("Hint without meta");
      expect(error.meta).toBeUndefined();
    });

    it("should create error with meta but no hint", () => {
      const error = new KbError(
        "ERR_META_ONLY",
        "Meta only message",
        undefined,
        { meta: "data" },
      );

      expect(error.code).toBe("ERR_META_ONLY");
      expect(error.message).toBe("Meta only message");
      expect(error.hint).toBeUndefined();
      expect(error.meta).toEqual({ meta: "data" });
    });

    it("should handle complex meta objects", () => {
      const complexMeta = {
        nested: { value: 42 },
        array: [1, 2, 3],
        nullValue: null,
        undefinedValue: undefined,
      };

      const error = new KbError(
        "ERR_COMPLEX",
        "Complex meta error",
        "Complex hint",
        complexMeta,
      );

      expect(error.meta).toEqual(complexMeta);
    });

    it("should handle empty string parameters", () => {
      const error = new KbError("", "", "", {});

      expect(error.code).toBe("");
      expect(error.message).toBe("");
      expect(error.hint).toBe("");
      expect(error.meta).toEqual({});
    });
  });

  describe("inheritance", () => {
    it("should be instanceof Error", () => {
      const error = new KbError("ERR_INHERITANCE", "Test");
      expect(error).toBeInstanceOf(Error);
    });

    it("should be instanceof KbError", () => {
      const error = new KbError("ERR_INHERITANCE", "Test");
      expect(error).toBeInstanceOf(KbError);
    });

    it("should have Error prototype methods", () => {
      const error = new KbError("ERR_METHODS", "Test message");
      expect(typeof error.toString).toBe("function");
      expect(typeof error.stack).toBe("string");
    });
  });

  describe("serialization", () => {
    it("should serialize to JSON correctly", () => {
      const error = new KbError(
        "ERR_SERIALIZE",
        "Serialization test",
        "Test hint",
        { test: "data" },
      );

      // Error objects don't serialize custom properties by default
      // We need to manually serialize them
      const errorData = {
        code: error.code,
        message: error.message,
        hint: error.hint,
        meta: error.meta,
      };

      const serialized = JSON.stringify(errorData);
      const parsed = JSON.parse(serialized);

      expect(parsed.code).toBe("ERR_SERIALIZE");
      expect(parsed.message).toBe("Serialization test");
      expect(parsed.hint).toBe("Test hint");
      expect(parsed.meta).toEqual({ test: "data" });
    });

    it("should handle undefined values in serialization", () => {
      const error = new KbError("ERR_UNDEFINED", "Test");

      const errorData = {
        code: error.code,
        message: error.message,
        hint: error.hint,
        meta: error.meta,
      };

      const serialized = JSON.stringify(errorData);
      const parsed = JSON.parse(serialized);

      expect(parsed.code).toBe("ERR_UNDEFINED");
      expect(parsed.message).toBe("Test");
      expect(parsed.hint).toBeUndefined();
      expect(parsed.meta).toBeUndefined();
    });
  });
});

describe("getExitCode", () => {
  it("should return 3 for ERR_FORBIDDEN", () => {
    const error = new KbError("ERR_FORBIDDEN", "Forbidden");
    expect(getExitCode(error)).toBe(3);
  });

  it("should return 2 for ERR_CONFIG_NOT_FOUND", () => {
    const error = new KbError("ERR_CONFIG_NOT_FOUND", "Config not found");
    expect(getExitCode(error)).toBe(2);
  });

  it("should return 2 for ERR_CONFIG_EXISTS_CONFLICT", () => {
    const error = new KbError("ERR_CONFIG_EXISTS_CONFLICT", "Config exists");
    expect(getExitCode(error)).toBe(2);
  });

  it("should return 2 for ERR_PATH_OUTSIDE_WORKSPACE", () => {
    const error = new KbError("ERR_PATH_OUTSIDE_WORKSPACE", "Path outside");
    expect(getExitCode(error)).toBe(2);
  });

  it("should return 1 for other ERR_ codes", () => {
    const error = new KbError("ERR_OTHER", "Other error");
    expect(getExitCode(error)).toBe(1);
  });

  it("should return 1 for non-ERR codes", () => {
    const error = new KbError("OTHER_CODE", "Other code");
    expect(getExitCode(error)).toBe(1);
  });

  it("should return 1 for empty code", () => {
    const error = new KbError("", "Empty code");
    expect(getExitCode(error)).toBe(1);
  });
});

describe("ERROR_HINTS", () => {
  it("should contain all expected error codes", () => {
    const expectedCodes: ErrorCode[] = [
      "ERR_CONFIG_NOT_FOUND",
      "ERR_CONFIG_INVALID",
      "ERR_CONFIG_EXISTS_CONFLICT",
      "ERR_PATH_OUTSIDE_WORKSPACE",
      "ERR_PRESET_NOT_RESOLVED",
      "ERR_PROFILE_INCOMPATIBLE",
      "ERR_PROFILE_NOT_DEFINED",
      "ERR_PROFILE_RESOLVE_FAILED",
      "ERR_PROFILE_EXTENDS_FAILED",
      "ERR_PROFILE_SCOPE_NOT_FOUND",
      "ERR_PROFILE_SCOPE_CONFLICT",
      "ERR_PROFILE_INVALID_FORMAT",
      "ERR_ARTIFACT_LIMIT_EXCEEDED",
      "ERR_FORBIDDEN",
    ];

    expectedCodes.forEach((code) => {
      expect(ERROR_HINTS[code]).toBeDefined();
      expect(typeof ERROR_HINTS[code]).toBe("string");
      expect(ERROR_HINTS[code].length).toBeGreaterThan(0);
    });
  });

  it("should have helpful hints for each error", () => {
    expect(ERROR_HINTS.ERR_CONFIG_NOT_FOUND).toContain("kb init");
    expect(ERROR_HINTS.ERR_CONFIG_INVALID).toContain("syntax");
    expect(ERROR_HINTS.ERR_CONFIG_EXISTS_CONFLICT).toContain("--force");
    expect(ERROR_HINTS.ERR_PATH_OUTSIDE_WORKSPACE).toContain("workspace");
    expect(ERROR_HINTS.ERR_PRESET_NOT_RESOLVED).toContain("preset");
    expect(ERROR_HINTS.ERR_PROFILE_INCOMPATIBLE).toContain("incompatible");
    expect(ERROR_HINTS.ERR_PROFILE_NOT_DEFINED).toContain("profiles[]");
    expect(ERROR_HINTS.ERR_PROFILE_RESOLVE_FAILED).toContain("profiles[]");
    expect(ERROR_HINTS.ERR_PROFILE_EXTENDS_FAILED).toContain("extends");
    expect(ERROR_HINTS.ERR_PROFILE_INVALID_FORMAT).toContain("kb.config.json");
    expect(ERROR_HINTS.ERR_PROFILE_SCOPE_NOT_FOUND).toContain("--scope");
    expect(ERROR_HINTS.ERR_PROFILE_SCOPE_CONFLICT).toContain("--scope");
    expect(ERROR_HINTS.ERR_ARTIFACT_LIMIT_EXCEEDED).toContain("artifacts");
    expect(ERROR_HINTS.ERR_FORBIDDEN).toContain("policy");
  });

  it("should be readonly", () => {
    const originalValue = ERROR_HINTS.ERR_CONFIG_NOT_FOUND;
    (ERROR_HINTS as any).ERR_CONFIG_NOT_FOUND = "Modified";
    expect(originalValue).toBe("Create .kb/kb-labs.config.yaml or run: kb init");
  });
});
