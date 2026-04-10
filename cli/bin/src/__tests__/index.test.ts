import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { executeCliMock } = vi.hoisted(() => {
  const executeCliMock = vi.fn();
  return { executeCliMock };
});

vi.mock("../runtime/bootstrap", () => ({
  executeCli: executeCliMock,
}));

const { run } = await import("../index");

describe("CLI run function", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    executeCliMock.mockReset();
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  it("delegates execution to executeCli", async () => {
    executeCliMock.mockResolvedValue(0);

    const result = await run(["--help"]);

    // run() now forwards a second options arg carrying moduleUrl (undefined
    // when none was passed). The runtime reads moduleUrl for platformRoot
    // resolution.
    expect(executeCliMock).toHaveBeenCalledWith(
      ["--help"],
      { moduleUrl: undefined },
    );
    expect(result).toBe(0);
  });

  it("propagates exit codes from executeCli", async () => {
    executeCliMock.mockResolvedValue(42);

    const result = await run(["version"]);

    expect(result).toBe(42);
  });
});
