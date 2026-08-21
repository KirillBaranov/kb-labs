import { describe, expect, it } from "vitest";
import { SUPPORTED_NODE_MAJOR, validateNodeVersion } from "../node-version";

describe("CLI Node.js runtime contract", () => {
  it("accepts the platform Node major", () => {
    expect(validateNodeVersion(`v${SUPPORTED_NODE_MAJOR}.18.0`)).toBeUndefined();
  });

  it.each(["v20.18.0", "v22.13.0", "v26.0.0", "not-a-version"])(
    "rejects unsupported Node %s before loading the platform",
    (version) => {
      expect(validateNodeVersion(version)).toContain("Node.js");
    },
  );
});
