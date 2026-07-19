import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { normalizeLLMError } from "./llm.js";

/**
 * Regression coverage for the gateway-502-shows-raw-HTML bug: `kb review run`
 * printed the raw HTML error page straight to the terminal, and `kb commit
 * commit` dumped the same raw HTML (plus a full stack trace) to stderr
 * before falling back to heuristics. Root cause: the `openai` SDK sets
 * `APIError.message` to the raw response body verbatim whenever that body
 * isn't valid JSON (openai/src/core.ts: `errMessage = errJSON ? undefined :
 * errText`) — which is exactly what an HTML 502 page from an intermediate
 * proxy looks like. `normalizeLLMError` intercepts that case before it
 * reaches either plugin's error-printing code.
 */
describe("normalizeLLMError", () => {
  it("replaces a raw-HTML 502 body with a clean, short message", () => {
    const htmlBody = "<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1><p>nginx</p></body></html>";
    // Mirrors what openai's fetch handler does for a non-JSON error body:
    // APIError.generate(status, errorResponse=undefined, message=rawText, headers).
    const apiError = OpenAI.APIError.generate(502, undefined, htmlBody, {});

    expect(() => normalizeLLMError(apiError)).toThrowError(/HTTP 502/);
    try {
      normalizeLLMError(apiError);
    } catch (err) {
      expect((err as Error).message).not.toContain("<html>");
      expect((err as Error).message).not.toContain("<!DOCTYPE");
      expect((err as Error).message).not.toContain("nginx");
    }
  });

  it("leaves a well-formed JSON API error (e.g. 401) untouched", () => {
    const jsonError = { error: { message: "Invalid API key", type: "invalid_request_error" } };
    const apiError = OpenAI.APIError.generate(401, jsonError, "Invalid API key", {});

    expect(() => normalizeLLMError(apiError)).toThrowError(apiError.message);
  });

  it("rethrows non-APIError errors unchanged", () => {
    const plain = new Error("network unreachable");
    expect(() => normalizeLLMError(plain)).toThrow(plain);
  });
});
