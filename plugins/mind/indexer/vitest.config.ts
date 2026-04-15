import base from "@kb-labs/devkit/vitest/node";
import { mergeConfig, defineConfig } from "vitest/config";

// Indexer e2e specs run real indexing on fixture repos; the default 5s timeout
// is enough locally but flakes on slower CI runners. Give each test 20s.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      testTimeout: 20_000,
    },
  }),
);
