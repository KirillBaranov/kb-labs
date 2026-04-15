import base from "@kb-labs/devkit/vitest/node";
import { defineConfig, mergeConfig } from "vitest/config";

// Git adapter specs shell out to real git; under CI the first invocation can
// exceed the 5s vitest default while the temp repo is initialised. 20s keeps
// runs non-flaky without hiding real regressions.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      testTimeout: 20_000,
    },
  }),
);
